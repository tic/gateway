// Collects data from UPS devices

const Nut = require("node-nut");
var nutServer = null;

var sinks = {};
var config = null;
var collectionInterval = null;
var upsList = {};

// Initiates a reset of the nut server connection,
// including closing any existing connection,
// opening a new one, and waiting for confirmation
// of the new connection. Connection issues are
// handled inside here, including automatic attempts
// to re-connect should the connection be broken.
async function resetNutConnection() {
    // If the server currently exists,
    // close it and wait for confirmation.
    if(nutServer !== null) {
        console.info("need to close existing nut connection")
        await new Promise(resolve => {
            nutServer.on("close", () => {
                console.info("cleared nut connection");
                nutServer = null;
                resolve();
            });
            nutServer.close();
        });
    }
    
    // Create a new server connection and,
    // if unsuccessful, keep trying every
    // 60 seconds.
    let connected = false;
    while(!connected) {
        // Wait for the configured time between
        // unsuccessfull reconnection attempts.
        if(nutServer !== null) {
            nutServer = null;
            await new Promise(resolve => setTimeout(resolve, config.nutAutoReconn));
        }

        connected = await new Promise(resolve => {
            let resolved = false;
            nutServer = new Nut(config.nutPort, config.nutAddress);
            nutServer.start();
            
            let connectionTimeout = setTimeout(() => {
                // If the "ready" event has already been
                // triggered, we don't need to do anything.
                if(resolved) {
                    return;
                }

                resolve(false);
            }, 3000);
            
            nutServer.on("ready", () => {
                // If the connection timeout was already
                // triggered, we need to just stop here.
                if(resolved) {
                    return;
                }

                // Connection has been established!
                resolved = true;
                clearTimeout(connectionTimeout);

                // With the fresh connection,
                // refresh the UPS list.
                nutServer.GetUPSList((list, err) => {
                    if(err) {
                        console.error("[nut] error trying to fetch ups data");
                        console.error(err);
                        nutServer.on("close", () => {
                            nutServer = null;
                            resolve(false);
                        });
                        nutServer.close();
                    } else {
                        upsList = list;
                        resolve(true);
                    }
                });
            });
        });
    }

    // If the nut server encounters a fatal error,
    // we need to attempt recovery by reinitializing
    // the nut server object.
    nutServer.on("error", err => {
        // Report the error
        console.error("[nut] nut server error:");
        console.error(err);

        // Re-create the nut server
        console.info("[nut] recursively re-initializing the nut server");
        resetNutConnection();
    });
}

// Creates a promise wrapper around
// node-nut's callback-style functions.
async function getDataFromUPS(upsname) {
    return new Promise((resolve, _) => {
        nutServer.GetUPSVars(upsname, (data, err) => {
            if(err) {
                resolve(null);
            } else {
                resolve(data);
            }
        });
    });
}

async function collect() {
    // Prevent some obvious errors that may come
    // when trying to use an anomalous nut server.
    if(nutServer === null) {
        console.info("[nut] tried to use nut server 'null'!");
    }

    // Fetch the data from the ups units
    const allData = (await Promise.all(
        Object.entries(upsList).map(async ([upsName, description]) => {
            const data = await getDataFromUPS(upsName);
            if(data === null) {
                return null;
            }
            
            return {
                ups: {
                    nutName: upsName,
                    description
                },
                data
            };
        })
    )).filter(data => data !== null);
    
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
            outputLoadW: parseFloat(data["ups.load"]) * parseFloat(data["ups.realpower.nominal"]) / 100,
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
        await resetNutConnection();

        // Set the collection interval
        collectionInterval = setInterval(collect, 60000);
        collect();
    },
    cleanup: async () => {
        clearInterval(collectionInterval);
        collectionInterval = null;
    }
}