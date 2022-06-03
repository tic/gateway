// Collects data from ecovacs robotic vacuums

const { resolveSoa } = require("dns");
const { EcoVacsAPI, countries } = require("ecovacs-deebot");
const nodeMachineId = require("node-machine-id");

var config = null;

// Data collection is initially every 45s, but
// if the vacuum is fully charged and idle, this
// interval is decreased to once every 5 minutes.
// If the interval is 5 minutes and the vacuum is
// no longer fully charged and idle, the interval
// is reset back to 45s.
var collectionInterval = null;
const activeInterval = 45000;
const passiveInterval = 300000;
var intervalLength = activeInterval;

// Reject a data collection promise after a time
const rejectionTimeout = 30000;
var vacuums = [];
var sinks = {};

// Small helper function to switch
// the collection interval around.
function switchInterval(intervalType) {
    clearInterval(collectionInterval);
    intervalLength = intervalType === "active" ? activeInterval : passiveInterval;
    collectionInterval = setInterval(collect, intervalLength);
}

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

// Deebot event name : Command to trigger the event
const events = {
    BatteryInfo :"GetBatteryState",
    CleanReport :"GetCleanState",
    ChargeState :"GetChargeState",
    LifeSpan :"GetLifeSpan"
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

            let resolves = [...new Array(Object.keys(events).length)].map(_ => null);
            const promises = resolves.map(
                (_, index) => new Promise((resolve, reject) => {
                    resolves[index] = resolve;
                    setTimeout(() => reject("request timeout"), rejectionTimeout);
                })
                .catch(
                    err => console.info("data request failed for vacuum %s: %s", vacuum.nickname, err)
                )
            );

            // Setup response collectors
            vacuum.event_promises = resolves;
            
            // Issue commands to the vacuum
            for(const command of Object.values(events)) {
                vacuum.vacbot.run(command);
            }

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

            // Check to see if the interval needs
            // to be updated (5m->45s or 45s->5m)
            // Vacuum is active if:
            // - Battery is less than 100 and not idle
            // OR
            // - Clean state is not 'stop'
            const vacuumActive = 
                ((metrics.battery !== undefined && metrics.battery < 100) &&
                (metrics.charge_state !== undefined && metrics.charge_state !== chargeModeMap.idle)) ||
                (metrics.clean_state !== undefined && metrics.clean_state !== cleanModeMap.stop);
            if(intervalLength === activeInterval && !vacuumActive) {
                // If the vacuum is fully charged and
                // cleaning status is idle, we need to
                // switch to the passive interval.
                switchInterval("passive");
                console.info("switched ecovacs device '%s' to passive mode", vacuum.nickname);
            } else if(intervalLength === passiveInterval && vacuumActive) {
                // If the vacuum is not fully charged
                // or the cleaning state is not idle,
                // we need to switch to the active interval.
                switchInterval("active");
                console.info("switched ecovacs device '%s' to active mode", vacuum.nickname)
            }

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
                        Object.keys(events).map((operation, index) => {
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

                // The collect() function manages switching
                // between the active and passive intervals.
                // Here we can assume the active interval and
                // the first collect() call will either keep
                // it or switch to the passive interval.
                switchInterval("active");
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
