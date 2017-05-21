'use strict';
const execSync = require('child_process').execSync;

const up = (dockerComposeFile) => {
    console.log(`Launching: ${dockerComposeFile}`);
    execSync(`docker-compose -f ${dockerComposeFile} up -d`);
};

const down = (dockerComposeFile) => {
    console.log(`Shutting down docker.`);
    execSync(`docker-compose -f ${dockerComposeFile} down`);
};

module.exports = {
    up: up,
    down: down
};