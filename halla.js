'use strict';
const yaml = require('js-yaml');
const fs = require('fs');
const os = require('os');
const path = require('path');
const exec = require('child_process').exec;
const execSync = require('child_process').execSync;
const spawn = require('child_process').spawn;
const spawnSync = require('child_process').spawnSync;
const pipeline = (...sections) => {
    return sections.reduce((section, pipeline) => Object.assign(pipeline, section), {});
};

const reverseEngineerYaml = (pipelineYaml) => {
    return yaml.load(pipelineYaml.split('{{').join('<<').split('}}').join('>>'))
};

const remoteConcourse = (target, concourseUrl, teamName) => {

    const listPipelines = () => {
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
    };

    const getPipeline = (pipeline) => {
        return new Promise((resolve, reject) => {
            exec(`fly -t ${target} get-pipeline --pipeline ${pipeline.name}`, (error, stdout, stderr) => {
                if (error || stderr) {
                    reject(error || stderr);
                }
                resolve({name: pipeline.name, yaml:stdout});
            });
        });
    };
    return {
        importAllPipelines: (outputFile) => {
            return listPipelines()
                .then((pipelines) => Promise.all(pipelines.map(getPipeline)))
                .then((pipelineYamls) => {
                    let keyedPipelines = pipelineYamls.map(pipelineYaml => {
                        let reverseEngineered = {};
                        reverseEngineered[pipelineYaml.name] = reverseEngineerYaml(pipelineYaml.yaml);
                        return reverseEngineered;
                    }).reduce((acc, i) => Object.assign(acc, i), {});
                    fs.writeFileSync(outputFile, Object.keys(keyedPipelines).reduce((fileContent, pipelineName) => {
                        fileContent += `pipelines["${pipelineName}"] = ${JSON.stringify(keyedPipelines[pipelineName])};\n\n`;
                        return fileContent;
                    }, "'use strict';\n\nlet pipelines = {};\n\n"));
                });
        },
        listPipelines: listPipelines,
        getPipeline: getPipeline,
        publish: (pipeline) => {
            return new Promise((resolve, reject) => {
                let pipelineFile = path.join(os.tmpdir(), 'temp_pipeline.yml');
                fs.writeFileSync(pipelineFile, pipeline.yaml);
                execSync(`fly -t ${target} sync`);
                let publishPipelineCommand = exec(`fly -t ${target} set-pipeline -p ${pipeline.name} --config ${pipelineFile}`);

                publishPipelineCommand.stdout.on('data', function (data) {
                    console.log(data.toString());
                    publishPipelineCommand.stdin.write('y\n');
                    resolve();
                });
                publishPipelineCommand.stderr.on('data', function (data) {
                    console.log(data.toString());
                    reject();
                });
            });
        },
    };
};

module.exports = {
    pipeline: pipeline,
    resourceTypes: (...resourceTypes) => {
        return {resourceTypes: resourceTypes};
    },
    resources: (...resources) => {
        return {resources: resources}
    },
    jobs: (...jobs) => {
        return {jobs: jobs}
    },
    job: (name, plans) => {
        return {
            name: name,
            plan: plans
        }
    },
    resourceType: {
        dockerResourceType: (name, repository, tag = 'latest') => {
            return {
                name: name,
                type: "docker-image",
                source: {"repository": repository, "tag": tag}

            }
        }
    },
    imageRresource: {
        dockerImage: (repository, username, password, tag) => {
            return {
                type: "docker-image",
                source: {
                    repository: repository,
                    username: username,
                    password: password,
                    tag: tag
                }
            };
        }
    },
    resource: {
        gitResource: (uri, branch, privateKey, sourceOptions = {}) => {
            return {
                name: "git-repo",
                type: "git",
                source: Object.assign({uri: uri, branch: branch, private_key: privateKey}, sourceOptions)
            };
        }
    },
    plan: {
        getResource: (name) => {
            return {
                get: name
            }
        },
        putResource: (name, params) => {
            return {
                put: name,
                params: params
            }
        },
        task: (taskDefinition) => {
            return taskDefinition;
        }
    },
    reverseEngineerYaml: reverseEngineerYaml,
    reverseEngineer: (pipelineYamlFile) => {
        return reverseEngineerYaml(fs.readFileSync(pipelineYamlFile, 'UTF-8'));
    },
    build: (pipeline) => {
        return yaml.dump(pipeline).split('<<').join('{{').split('>>').join('}}');
    },
    concourse: (target, concourseUrl, teamName) => {
        return new Promise((resolve, reject) => {
            const login = spawn('fly', ['-t', target, 'login', '--concourse-url', concourseUrl, '--team-name', teamName]);

            login.stdout.on('data', (data) => {
                if (data) {
                    let url = data.toString().match(/(https?:\/\/[^\s]+)/gm);
                    if (url) {
                        console.log('Logging into Concourse: ' + url);
                        spawnSync('/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome', [url]);
                        resolve(remoteConcourse(target, concourseUrl, teamName));
                    }
                }
            });

            login.stderr.on('data', (data) => {
                console.log(`stderr: ${data}`);
                reject(data);
            });
        });
    },
};

