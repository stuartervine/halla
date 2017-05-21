'use strict';
const yaml = require('js-yaml');
const fs = require('fs');
const os = require('os');
const path = require('path');
const exec = require('child_process').exec;
const execSync = require('child_process').execSync;
const spawn = require('child_process').spawn;
const spawnSync = require('child_process').spawnSync;

const reverseEngineerYaml = (pipelineYaml) => {
    return yaml.load(pipelineYaml.split('{{').join('<<').split('}}').join('>>'))
};

let convertPipelineToJavascript = function (pipelineDefinition) {
    return `pipelines["${pipelineDefinition.name}"] = ${JSON.stringify(reverseEngineerYaml(pipelineDefinition.yaml))};\n\n`;
};

const remoteConcourse = (target) => {
    let concourse = {
        listPipelines: () => {
            return new Promise((resolve, reject) => {
                exec(`fly -t ${target} pipelines`, (error, stdout, stderr) => {
                    if (error || stderr) {
                        reject(error || stderr);
                    }
                    resolve(stdout.split('\n').map(line => line.split(' ').filter(w => w)).map(words => {
                        return {name: words[0], paused: words[1] === "yes", public_pipeline: words[2] === 'yes'};
                    }));
                });
            });
        },
        getPipeline: (pipeline) => {
            return new Promise((resolve, reject) => {
                exec(`fly -t ${target} get-pipeline --pipeline ${pipeline.name}`, (error, stdout, stderr) => {
                    if (error || stderr) {
                        reject(error || stderr);
                    }
                    resolve({name: pipeline.name, yaml: stdout});
                });
            });
        },

        importAllPipelines: (outputFile) => {
            return concourse.listPipelines()
                .then((pipelines) => {
                    return Promise.all(pipelines.map(concourse.getPipeline));
                })
                .then((pipelineDefinitions) => {
                    fs.writeFileSync(outputFile, pipelineDefinitions
                        .map(convertPipelineToJavascript)
                        .reduce((fileContent, line) => fileContent + line, "pipelines = {};\n\n") + "\nmodule.exports=pipelines;");
                })
                .catch((err) => {
                    console.log(`Error importing pipelines: ${err}`)
                });
        },

        publish: (pipeline) => {
            return new Promise((resolve, reject) => {
                let pipelineFile = path.join(os.tmpdir(), 'temp_pipeline.yml');
                fs.writeFileSync(pipelineFile, pipeline.yaml);
                let publishPipelineCommand = exec(`fly -t ${target} set-pipeline -p ${pipeline.name} --config ${pipelineFile}`);
                publishPipelineCommand.stdout.on('data', () => {
                    publishPipelineCommand.stdin.write('y\n');
                    while (execSync(`fly -t ${target} pipelines`).toString().indexOf(pipeline.name) === -1) {
                    }
                    resolve(concourse);
                });
                publishPipelineCommand.stderr.on('data', function (data) {
                    console.log(`Error setting pipeline ${pipeline.name}: ${data.toString()}`);
                    reject();
                });
            });
        }
    };
    return concourse;
};

const browser = () => {
    const browsers = {
        'darwin': '/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome',
        'win32': 'start chrome',
        'linux': 'google-chrome'
    };

    return {
        openUrl: function (url) {
            spawnSync(browsers[os.platform()], [url]);
        }
    }
};

module.exports = {
    reverseEngineerYaml: reverseEngineerYaml,
    reverseEngineer: (pipelineYamlFile) => {
        return reverseEngineerYaml(fs.readFileSync(pipelineYamlFile, 'UTF-8'));
    },
    build: (pipeline) => {
        return yaml.dump(pipeline).split('<<').join('{{').split('>>').join('}}');
    },
    concourse_basic_auth: (target, concourseUrl, username, password) => {
        return new Promise((resolve, reject) => {
            const login = spawn('fly', ['-t', target, 'login', '--concourse-url', concourseUrl, '-u', username, '-p', password]);

            login.stdout.on('data', (data) => {
                if (data) {
                    let targetSaved = data.toString().match(/(target saved)/gm);
                    if (targetSaved) {
                        console.log('Logging into Concourse: ' + concourseUrl);
                        console.log(execSync('docker ps -a').toString());
                        resolve(remoteConcourse(target));
                    }
                }
            });

            login.stderr.on('data', (data) => {
                console.log(`Error logging into Concourse: ${data.toString()}`);
                reject(data);
            });
        });

    },
    concourse: (target, concourseUrl, teamName) => {
        return new Promise((resolve, reject) => {
            const login = spawn('fly', ['-t', target, 'login', '--concourse-url', concourseUrl, '--team-name', teamName]);

            login.stdout.on('data', (data) => {
                if (data) {
                    let url = data.toString().match(/(https?:\/\/[^\s]+)/gm);
                    if (url) {
                        console.log('Logging into Concourse: ' + url);
                        browser.openUrl(url);
                        resolve(remoteConcourse(target));
                    }
                }
            });

            login.stderr.on('data', (data) => {
                console.log(`Error logging into Concourse: ${data}`);
                reject(data);
            });
        });
    },
};

