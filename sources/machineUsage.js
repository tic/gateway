
const { os } = require("node-os-utils");
const osu = require("node-os-utils");

var collectionInterval = null;

async function collect() {
    // average usage over 60 seconds
    const [netdata, cpudata] = await Promise.all([
        osu.netstat.inOut(55000),
        osu.cpu.usage(55000)
    ]);
    
    let data = false;

    // Build the metrics object
    const metrics = {};
    if(netdata?.total?.inputMb !== undefined) {
        metrics.netIn = netdata.eno1.inputMb;
        data = true;
    }
    if(netdata?.total?.outputMb !== undefined) {
        metrics.netOut = netdata.eno1.outputMb;
        data = true;
    }
    if(cpudata !== undefined) {
        metrics.cpuUsage = cpudata;
        data = true;
    }

    // We don't need to continue if no data was collected
    if(!data) {
        return;
    }

    // Take note of some metadata
    const metadata = {
        machineName: os.hostname().toLowerCase()
    };

    // Drain the collected data
    sinks.sif.drain(
        "machineUsage",
        metrics,
        metadata
    );
}

module.exports = {
    setup: async (_, sinksIn) => {
        sinks = sinksIn;
        collect();
        collectionInterval = setInterval(collect, 60000);
    },
    cleanup: async () => {
        clearInterval(collectionInterval);
    }
}