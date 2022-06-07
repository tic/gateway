// Calling this function dynamically loads the config
function getConfig() {
    const { parsed: env } = require("dotenv").config();
    
    // The config is separated by the various files it needs to read from
    const config = {
        disableSinks: env.DISABLE_SINKS === "true",
        sourceWhitelist: env.SOURCE_WHITELIST === "" ? [] : env.SOURCE_WHITELIST.split(","),
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
                email: env.ECOVACS_EMAIL,
                password: env.ECOVACS_PASSWORD,
                country: env.ECOVACS_COUNTRY
            },
            nut: {
                nutAddress: env.NUT_ADDRESS,
                nutPort: env.NUT_PORT
            }
        }
    }
    return config;
}

module.exports = {
    getConfig: getConfig
};
