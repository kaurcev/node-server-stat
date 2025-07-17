require('dotenv').config();

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { exec } = require('child_process');
const os = require('os');
const si = require('systeminformation');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 7787;
const STATS_INTERVAL = process.env.STATS_INTERVAL || 1000;
const HISTORY_LENGTH = process.env.HISTORY_LENGTH || 60;
const NETWORK_INTERFACE = process.env.NETWORK_INTERFACE || null;
const PROCESSES_LIMIT = process.env.PROCESSES_LIMIT || 4;
const WS_PATH = process.env.WS_PATH || null;

let statsHistory = {
    cpu: [],
    memory: [],
    network: { rx: [], tx: [] }
};
let prevNetworkStats = { rx_bytes: 0, tx_bytes: 0 };

app.use(express.static('public'));

async function collectStats() {
    try {
        const cpuUsage = await new Promise(resolve => {
            exec("grep 'cpu ' /proc/stat", (err, stdout) => {
                if (err) return resolve(0);
                const values = stdout.split(/\s+/).slice(1).map(Number);
                const total = values.reduce((a, b) => a + b, 0);
                const idle = values[3];
                resolve(Math.round((100 - (idle / total * 100)) * 10) / 10);
            });
        });

        const memTotal = os.totalmem();
        const memFree = os.freemem();
        const memUsed = memTotal - memFree;
        const memUsage = Math.round((memUsed / memTotal) * 100);

        const topProcesses = await new Promise(resolve => {
            exec(`ps -eo pid,comm,%cpu --sort=-%cpu | head -n ${PROCESSES_LIMIT}`, (err, stdout) => {
                if (err) return resolve([]);
                const processes = stdout.trim().split('\n').slice(1).map(line => {
                    const [pid, comm, cpu] = line.trim().split(/\s+/);
                    return { pid, name: comm, cpu: parseFloat(cpu) };
                });
                resolve(processes);
            });
        });

        const netStats = await si.networkStats();
        let currentInterface;
        
        if (NETWORK_INTERFACE) {
            currentInterface = netStats.find(intf => intf.iface === NETWORK_INTERFACE);
        }
        
        if (!currentInterface) {
            currentInterface = netStats.find(intf => !intf.iface.startsWith('lo')) || netStats[0];
        }
        
        let rx_speed = 0;
        let tx_speed = 0;
        
        if (prevNetworkStats.rx_bytes > 0) {
            const timeDiff = STATS_INTERVAL / 1000;
            rx_speed = Math.round((currentInterface.rx_bytes - prevNetworkStats.rx_bytes) / timeDiff);
            tx_speed = Math.round((currentInterface.tx_bytes - prevNetworkStats.tx_bytes) / timeDiff);
        }
        
        prevNetworkStats = {
            rx_bytes: currentInterface.rx_bytes,
            tx_bytes: currentInterface.tx_bytes
        };

        return {
            timestamp: Date.now(),
            cpu: cpuUsage,
            memory: {
                total: Math.round(memTotal / 1024 / 1024),
                used: Math.round(memUsed / 1024 / 1024),
                free: Math.round(memFree / 1024 / 1024),
                usage: memUsage
            },
            processes: topProcesses,
            network: {
                rx: rx_speed,
                tx: tx_speed
            }
        };
    } catch (error) {
        console.error('Error collecting stats:', error);
        return null;
    }
}

function updateHistory(stats) {
    statsHistory.cpu.push(stats.cpu);
    if (statsHistory.cpu.length > HISTORY_LENGTH) statsHistory.cpu.shift();
    
    statsHistory.memory.push(stats.memory.usage);
    if (statsHistory.memory.length > HISTORY_LENGTH) statsHistory.memory.shift();
    
    statsHistory.network.rx.push(stats.network.rx);
    statsHistory.network.tx.push(stats.network.tx);
    if (statsHistory.network.rx.length > HISTORY_LENGTH) {
        statsHistory.network.rx.shift();
        statsHistory.network.tx.shift();
    }
}


const wsOptions = WS_PATH ? { server, path: WS_PATH } : { server };
const wss = new WebSocket.Server(wsOptions);

wss.on('connection', (ws) => {
    ws.send(JSON.stringify({
        type: 'init',
        history: statsHistory
    }));
});

setInterval(async () => {
    const stats = await collectStats();
    if (!stats) return;
    
    updateHistory(stats);
    
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: 'update',
                stats: stats,
                history: statsHistory
            }));
        }
    });
}, STATS_INTERVAL);

server.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
    if (WS_PATH) {
        console.log(`Эндпоинт вебсокета: ws://localhost:${PORT}${WS_PATH}`);
    } else {
        console.log(`Эндпоинт вебсокета: ws://localhost:${PORT}`);
    }
});