const cpuCtx = document.getElementById('cpuChart').getContext('2d');
const memCtx = document.getElementById('memoryChart').getContext('2d');
const netCtx = document.getElementById('networkChart').getContext('2d');
const loadCtx = document.getElementById('loadChart').getContext('2d');

const accentColor = '#4e73df';
const accentLight = 'rgba(78, 115, 223, 0.1)';
const gridColor = 'rgba(0, 0, 0, 0.05)';

const chartOptions = {
    maintainAspectRatio: false,
    animation: false,
    responsive: true,
    scales: {
        x: {
            display: false,
            grid: { display: false }
        },
        y: {
            min: 0,
            grid: { 
                color: gridColor,
                borderDash: [5, 5]
            },
            ticks: {
                font: { size: 9 },
                maxTicksLimit: 6
            }
        }
    },
    elements: {
        point: { radius: 0 },
        line: { tension: 0.4 }
    },
    plugins: {
        legend: { display: false },
        tooltip: { enabled: false }
    }
};

const cpuChart = new Chart(cpuCtx, {
    type: 'line',
    data: {
        datasets: [{
            label: 'Использование процессора',
            data: [],
            borderColor: accentColor,
            backgroundColor: accentLight,
            borderWidth: 2,
            fill: true
        }]
    },
    options: {
        ...chartOptions,
        scales: { ...chartOptions.scales, y: { ...chartOptions.scales.y, max: 100 } }
    }
});

const memChart = new Chart(memCtx, {
    type: 'line',
    data: {
        datasets: [{
            label: 'Использование памяти (RAM)',
            data: [],
            borderColor: '#1cc88a',
            backgroundColor: 'rgba(28, 200, 138, 0.1)',
            borderWidth: 2,
            fill: true
        }]
    },
    options: {
        ...chartOptions,
        scales: { ...chartOptions.scales, y: { ...chartOptions.scales.y, max: 100 } }
    }
});

const netChart = new Chart(netCtx, {
    type: 'line',
    data: {
        datasets: [
            {
                label: 'Загрузка',
                data: [],
                borderColor: accentColor,
                backgroundColor: 'transparent',
                borderWidth: 2
            },
            {
                label: 'Отправка',
                data: [],
                borderColor: '#e74a3b',
                backgroundColor: 'transparent',
                borderWidth: 2
            }
        ]
    },
    options: chartOptions
});

const loadChart = new Chart(loadCtx, {
    type: 'doughnut',
    data: {
        labels: ['Используется', 'Свободно'],
        datasets: [{
            data: [0, 100],
            backgroundColor: [accentColor, gridColor],
            borderWidth: 0
        }]
    },
    options: {
        maintainAspectRatio: false,
        responsive: true,
        cutout: '70%',
        plugins: {
            legend: { display: false },
            tooltip: { enabled: false }
        }
    }
});

const ws = new WebSocket(`ws://${window.location.hostname}:${window.location.port}`);

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
    
    if (data.type === 'init') {
        initCharts(data.history);
    } 
    else if (data.type === 'update') {
        updateMetrics(data.stats);
        updateCharts(data.stats, data.history);
        updateProcesses(data.stats.processes);
    }
};

function initCharts(history) {
    const labels = Array(history.cpu.length).fill('');
    
    cpuChart.data.labels = labels;
    cpuChart.data.datasets[0].data = history.cpu;
    
    memChart.data.labels = labels;
    memChart.data.datasets[0].data = history.memory;
    
    netChart.data.labels = labels;
    netChart.data.datasets[0].data = history.network.rx.map(b => b / 1024);
    netChart.data.datasets[1].data = history.network.tx.map(b => b / 1024);
    
    cpuChart.update();
    memChart.update();
    netChart.update();
}

function updateMetrics(stats) {
    document.getElementById('cpuValue').textContent = `${stats.cpu}%`;
    document.getElementById('memoryValue').textContent = `${stats.memory.usage}%`;
    document.getElementById('memoryLabel').textContent = 
        `${stats.memory.used} MB / ${stats.memory.total} MB`;
    document.getElementById('downloadValue').textContent = 
        `${Math.round(stats.network.rx / 1024)} KB/s`;
    document.getElementById('uploadValue').textContent = 
        `${Math.round(stats.network.tx / 1024)} KB/s`;
    
    loadChart.data.datasets[0].data = [
        stats.memory.usage, 
        100 - stats.memory.usage
    ];
    loadChart.update();
}

function updateCharts(stats, history) {
    cpuChart.data.datasets[0].data = history.cpu;
    cpuChart.update('none');
    
    memChart.data.datasets[0].data = history.memory;
    memChart.update('none');
    
    netChart.data.datasets[0].data = history.network.rx.map(b => b / 1024);
    netChart.data.datasets[1].data = history.network.tx.map(b => b / 1024);
    netChart.update('none');
}

function updateProcesses(processes) {
    const tbody = document.querySelector('#processTable tbody');
    let html = '';
    
    processes.forEach(p => {
        html += `
        <tr>
            <td>${p.name}</td>
            <td>${p.pid}</td>
            <td>${p.cpu.toFixed(1)}%</td>
            <td>
                <div class="progress-bar">
                    <div class="progress-value" style="width: ${Math.min(p.cpu, 100)}%"></div>
                </div>
            </td>
        </tr>`;
    });
    
    tbody.innerHTML = html;
}

window.addEventListener('resize', function() {
    cpuChart.resize();
    memChart.resize();
    netChart.resize();
    loadChart.resize();
});