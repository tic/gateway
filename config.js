function validateEnv(envFile, neededFields) {
    for(const field of neededFields) {
        if(envFile[field] === undefined) {
            throw new Error(`env file missing property ${field}. the following fields are required:\n${neededFields.toString()}`);
        }
    }
}

// Calling this function dynamically loads the config
function getConfig() {
    const { parsed: envFile } = require("dotenv").config();
    
    const missingKeys = [];
    function env(key) {
        const value = envFile[key];
        if(value === undefined) {
            missingKeys.push(key);
            return "";
        }
        return value;
    }

    // The config is separated by the various files it needs to read from
    const config = {
        disableSinks: env("DISABLE_SINKS") === "true",
        sourceWhitelist: env("SOURCE_WHITELIST") === "" ? [] : env("SOURCE_WHITELIST").split(","),
        sourceBlacklist: env("SOURCE_BLACKLIST") === "" ? [] : env("SOURCE_BLACKLIST").split(","),
        sinks: {
            sif: {
                userPoolId: env("SIF_USERPOOLID"),
                clientId: env("SIF_CLIENTID"),
                username: env("SIF_USERNAME"),
                password: env("SIF_PASSWORD")
            }
        },
        sources: {
            ecovacs: {
                email: env("ECOVACS_EMAIL"),
                password: env("ECOVACS_PASSWORD"),
                country: env("ECOVACS_COUNTRY")
            },
            nut: {
                nutAddress: env("NUT_ADDRESS"),
                nutPort: env("NUT_PORT")
            }
        }
    }

    if(missingKeys.length > 0) {
        console.warn(`!!! WARNING: the config referenced environment variables that were not found in the .env file:`);
        console.warn(`\t- ${missingKeys.join("\t- ")}\n`);
    }

    return config;
}

module.exports = {
    getConfig: getConfig
};
