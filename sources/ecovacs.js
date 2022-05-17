// Collects data from ecovacs robotic vacuums

const { resolveSoa } = require("dns");
const { EcoVacsAPI, countries } = require("ecovacs-deebot");
const nodeMachineId = require("node-machine-id");

var config = null;
var collectionInterval = null;
const rejectionTimeout = 30000; // reject a data collection promise after a time
var vacuums = [];
var sinks = {};

const chargeModeMap = {
    idle: 0,
    charging: 1,
    returning: 2,
    other: 3
};

const cleanModeMap = {
    stop: 0,
    auto: 1,
    edge: 2,
    spot: 3,
    singleRoom: 4,
    other: 5
}

// From each vacuum, get the following data:
// {
//     battery: 100,
//     charge_state: 0, // 0=not charging; 1=charging; 2=full
//     clean_state: 0, // 0=idle; 1=cleaning; 2=returning
//     main_brush: 100,
//     side_brush: 100,
//     filter: 100,
// }
// This function issues the commands and pools
// the separate responses together into one.
async function collect() {
    const packets = await Promise.all(
        vacuums.map(async vacuum => {
            if(!vacuum.connected) {
                console.info("vacuum %s is not connected! skipping", vacuum.nickname);
                return null;
            }

            let resolves = [null, null, null, null];
            const promises = [0, 0, 0, 0].map(
                (_, index) => new Promise((resolve, reject) => {
                    resolves[index] = resolve;
                    setTimeout(reject, rejectionTimeout);
                })
                .catch(
                    err => console.info("data request failed for vacuum %s", vacuum.nickname)
                )
            );

            // Setup response collectors
            vacuum.event_promises = resolves;
            
            // Issue commands to the vacuum
            const vacbot = vacuum.vacbot;
            vacbot.run("GetBatteryState");
            vacbot.run('GetCleanState');
            vacbot.run('GetChargeState');
            vacbot.run('GetLifeSpan');

            // Wait for all commands to finish or timeout
            const data = await Promise.all(promises);

            // Build a nice and pretty metrics object
            const metrics = {};
            if(data[0] !== undefined) {
                metrics.battery = data[0];
            }
            
            if(data[1] !== undefined) {
                metrics.clean_state = cleanModeMap[data[1]] ?? cleanModeMap.other;
            }

            if(data[2] !== undefined) {
                if(data[0] !== undefined) {
                    if(data[2] === "charging" && data[0] >= 100) {
                        metrics.charge_state = chargeModeMap.idle;
                    } else {
                        metrics.charge_state = chargeModeMap[data[2]] ?? chargeModeMap.other;
                    }
                } else {
                    metrics.charge_state = chargeModeMap[data[2]] ?? chargeModeMap.other;
                }
            }

            if(data[3] !== undefined) {
                for(const [consumable, value] of Object.entries(data[3])) {
                    if(value !== undefined) {
                        metrics[consumable] = value;
                    }
                }
            }

            // Build the metadata object
            const metadata = {
                device_id: vacuum.device_id,
                device_type: vacuum.device_type
            };

            return [metrics, metadata];
        })
    );
    
    for(const [metrics, metadata] of packets) {
        console.info("draining ecovacs data for device %s", metadata.device_id);
        sinks.sif.drain(
            "ecovacs",
            metrics,
            metadata,
            undefined,
            metadata.device_id
        );
    }
}

module.exports = {
    setup: async (configIn, sinksIn) => {
        config = configIn;
        sinks = sinksIn;
        const continent = countries[config.country.toUpperCase()].continent.toLowerCase();
        
        api = new EcoVacsAPI(
            EcoVacsAPI.getDeviceId(nodeMachineId.machineIdSync(), 0),
            config.country
        );
        
        api.connect(config.email, EcoVacsAPI.md5(config.password)).then(() => {
            api.devices().then(async (devices) => {
                vacuums = devices.map((device, index) => ({
                    _id: index,
                    device_id: device.did,
                    connected: false,
                    nickname: device.nick,
                    device_type: device.deviceName, // e.g. "DEEBOT N79S/SE",
                    event_promises: [], // used to group event responses in collect()
                    vacbot: api.getVacBot(
                        api.uid, 
                        EcoVacsAPI.REALM, 
                        api.resource, 
                        api.user_access_token, 
                        device,
                        continent
                    )
                }));
                
                const connectResolves = [...new Array(vacuums.length)].map(_ => null);
                const connections = [...new Array(vacuums.length)].map((_, index) => new Promise(resolve => connectResolves[index] = resolve));

                // Connect to the vacuums
                for(const vacuum of vacuums) {
                    vacuum.vacbot.connect();
                    vacuum.vacbot.on("ready", () => {
                        console.info("connected to vacuum '%s'", vacuum.nickname);
                        vacuum.connected = true;
                        connectResolves[vacuum._id]();
                        // Register event handlers
                        [
                            "BatteryInfo",
                            "CleanReport",
                            "ChargeState",
                            "LifeSpan"
                        ].map((operation, index) => {
                            vacuum.vacbot.on(operation, value => {
                                if(typeof vacuum.event_promises[index] === "function") {
                                    vacuum.event_promises[index](value);
                                }
                            });
                        });
                    });

                    // Maybe put something here to handle automatically
                    // renewing connects to the vacuums, if needed...
                    vacuum.vacbot.on("error", err => {
                        console.error(err);
                        // 
                    });
                }

                await Promise.all(connections);
                collect();
                collectionInterval = setInterval(collect, 180000); // collect data every 5 minutes
            });
        }).catch((e) => {
            console.error(e.message);
            console.error("Failure in connecting!");
        });
    },
    cleanup: async () => {
        clearInterval(collectionInterval);
    }
}
