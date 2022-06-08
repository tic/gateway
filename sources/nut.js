// Collects data from UPS devices

const { connect } = require("mqtt");
const Nut = require("node-nut");
var nutServer = null;

var sinks = {};
var config = null;
var collectionInterval = null;
var upsList = {};

// Creates a promise wrapper around
// node-nut's callback-style functions.
async function getDataFromUPS(upsname) {
    return new Promise((resolve, _) => {
        nutServer.GetUPSVars(upsname, (data, err) => {
            if(err) {
                resolve({});
            } else {
                resolve(data);
            }
        });
    });
}

async function collect() {
    // Fetch the data from the ups units
    const allData = await Promise.all(
        Object.entries(upsList).map(async ([upsName, description]) => {
            return {
                ups: {
                    nutName: upsName,
                    description
                },
                data: await getDataFromUPS(upsName)
            };
        })
    );
    
    // Transform collected data for the sif sink
    const sifData = allData.map(({ups, data}) => ({
        metadata: {
            serialNumber: data["device.serial"],
            description: ups.description,
            nutName: ups.nutName
        },
        metrics: {
            batteryChargeLevel: parseFloat(data["battery.charge"]),
            estRuntime: parseFloat(data["battery.runtime"]),
            batteryVoltage: parseFloat(data["battery.voltage"]),
            inputVoltage: parseFloat(data["input.voltage"]),
            outputVoltage: parseFloat(data["output.voltage"]),
            outputLoadPct: parseFloat(data["ups.load"]),
            outputLoadkW: parseFloat(data["ups.load"]) * parseFloat(data["ups.realpower.nominal"]) / 100,
            status: data["ups.status"]
        }
    }));

    // Drain data into the sif sink
    for(const { metrics, metadata} of sifData) {
        console.info("draining nut data for device %s (%s)", metadata.serialNumber, metadata.nutName);
        sinks.sif.drain(
            "nut",
            metrics,
            metadata,
            undefined,
            metadata.serialNumber
        );
    }
}

module.exports = {
    setup: async (configIn, sinksIn) => {
        sinks = sinksIn;
        config = configIn;
        nutServer = new Nut(config.nutPort, config.nutAddress);
        
        const listReady = new Promise((resolve, _) => {
            nutServer.on("ready", () => {
                let resolved = false;
                const connectTimeout = setTimeout(
                    () => {
                        resolved = true;
                        resolve(new Error("connection timed out"));
                    }, 
                    10000
                );
                nutServer.GetUPSList((list, err) => {
                    upsList = list;
                    if(resolved === false) {
                        clearTimeout(connectTimeout);
                        resolve(err);
                    }
                });
            });
        });

        // Attach handlers to the nut server
        nutServer.on("error", err => {
            console.info("nut error!");
            console.error(err);
        });
        nutServer.on("close", () => {
            console.info("nut server closed!");
        });

        // Initiate a connection to the nut server
        nutServer.start();

        // Wait until the connection has been attempted
        const connectErr = await listReady;
        if(connectErr) {
            console.info("nut connect error!");
            console.error(connectErr);
            return;
        }

        // Set the collection interval
        collectionInterval = setInterval(collect, 60000);
        collect();
    },
    cleanup: async () => {
        clearInterval(collectionInterval);
        collectionInterval = null;
    }
}