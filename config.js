// Calling this function dynamically loads the config
function getConfig() {
    const { parsed: env } = require("dotenv").config();
    
    // The config is separated by the various files it needs to read from
    const config = {
        sinks: {
            sif: {
                userPoolId: env.SIF_USERPOOLID,
                clientId: env.SIF_CLIENTID,
                username: env.SIF_USERNAME,
                password: env.SIF_PASSWORD
            }
        },
        sources: {
            ecovacs: {
    
            }
        }
    }
    return config;
}

module.exports = {
    getConfig: getConfig
};
