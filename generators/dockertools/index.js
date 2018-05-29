/*
 Copyright 2017 IBM Corp.
 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at
 http://www.apache.org/licenses/LICENSE-2.0
 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

'use strict';

const Generator = require('yeoman-generator');
const Handlebars = require('../lib/handlebars.js');
const Utils = require('../lib/utils');

const FILENAME_CLI_CONFIG = "cli-config.yml";
const FILENAME_DOCKERFILE = "Dockerfile";
const FILENAME_DOCKERCOMPOSE = "docker-compose.yml";
const FILENAME_DOCKERCOMPOSE_TOOLS = "docker-compose-tools.yml";
const FILENAME_DOCKERFILE_TOOLS = "Dockerfile-tools";
const FILENAME_DOCKER_IGNORE = ".dockerignore";

module.exports = class extends Generator {
	constructor(args, opts) {
		super(args, opts);

		// opts -> this.options via Yeoman Generator (super)

		if (typeof (this.options.bluemix) === 'string') {
			this.bluemix = JSON.parse(this.options.bluemix || '{}');
		} else {
			this.bluemix = this.options.bluemix;
		}

		if (typeof(this.options.services) === 'string') {
			this.options.services  = JSON.parse(this.options.services || '[]');
		} else {
			this.options.services = this.options.services || [];
		}
	}

	configuring() {
	}

	writing() {
		switch (this.bluemix.backendPlatform) {
			case 'NODE':
				this._generateNodeJS();
				break;
			case 'JAVA':
				this._generateJava();
				break;
			case 'SPRING':
				this._generateJava();
				break;
			case 'SWIFT':
				this._generateSwift();
				break;
			case 'PYTHON':
				this._generatePython();
				break;
			case 'DJANGO':
				this._generateDjango();
				break;
			default:
				throw new Error(`No language ${this.bluemix.backendPlatform} found`);
		}
	}

	_generateSwift() {
		// Files to contain custom build and test commands
		const FILENAME_SWIFT_BUILD = ".swift-build-linux";
		const FILENAME_SWIFT_TEST = ".swift-test-linux";
		const port = 8080;

		// Define metadata for all services that
		// require custom logic in Dockerfiles
		const services = require('./resources/swift/services.json');

		// Get array with all the keys for the services objects
		const servKeys = Object.keys(services);
		const serviceItems = [];
		const serviceEnvs = [];

		// Iterate over service keys to search for provisioned services
		let compilationOptions = "";
		for (let index in servKeys) {
			const servKey = servKeys[index];
			if(this.bluemix.hasOwnProperty(servKey)) {
				serviceItems.push(services[servKey]);
				if (services[servKey].hasOwnProperty("compilationOptions")) {
					compilationOptions = compilationOptions + " " + services[servKey].compilationOptions;
				}
			}

			if(services[servKey].envs){
				serviceEnvs.push(services[servKey].envs);
			}
		}
		compilationOptions = compilationOptions.trim();

		const applicationName = Utils.sanitizeAlphaNum(this.bluemix.name);
		const executableName = this.bluemix.name;

		const cliConfig = {
			containerNameRun: `${applicationName.toLowerCase()}-swift-run`,
			containerNameTools: `${applicationName.toLowerCase()}-swift-tools`,
			hostPathRun: '.',
			hostPathTools: '.',
			containerPathRun: '/swift-project',
			containerPathTools: '/swift-project',
			containerPortMap: '8080:8080',
			containerPortMapDebug: '2048:1024,2049:1025',
			dockerFileRun: 'Dockerfile',
			dockerFileTools: 'Dockerfile-tools',
			imageNameRun: `${applicationName.toLowerCase()}-swift-run`,
			imageNameTools: `${applicationName.toLowerCase()}-swift-tools`,
			buildCmdRun: '/swift-utils/tools-utils.sh build release',
			testCmd: '/swift-utils/tools-utils.sh test',
			buildCmdDebug: '/swift-utils/tools-utils.sh build debug',
			runCmd: '',
			stopCmd: '',
			debugCmd: `/swift-utils/tools-utils.sh debug ${executableName} 1024`,
			chartPath: `chart/${applicationName.toLowerCase()}`
		};

		// Create Docker config object for Swift
		const dockerConfig = {
			executableName: `${executableName}`,
			serviceItems: serviceItems
		}

		this._copyTemplateIfNotExists(FILENAME_CLI_CONFIG, 'cli-config-common.yml', {
			cliConfig
		});

		this._copyTemplateIfNotExists(FILENAME_DOCKERFILE, 'swift/' + FILENAME_DOCKERFILE, {
			dockerConfig
		});

		this._copyTemplateIfNotExists(FILENAME_DOCKERFILE_TOOLS, 'swift/' + FILENAME_DOCKERFILE_TOOLS, {
			dockerConfig
		});

		if (compilationOptions.length > 0) {
			this._copyTemplateIfNotExists(FILENAME_SWIFT_BUILD, 'swift/' + FILENAME_SWIFT_BUILD, {
				compilationOptions: compilationOptions
			});

			this._copyTemplateIfNotExists(FILENAME_SWIFT_TEST, 'swift/' + FILENAME_SWIFT_TEST, {
				compilationOptions: compilationOptions
			});
		}

		if(this.options.services.length > 0){
			this._copyTemplateIfNotExists(FILENAME_DOCKERCOMPOSE, 'swift/docker-compose.yml', {
				containerName: `${applicationName.toLowerCase()}-swift-run`,
				image: `${applicationName.toLowerCase()}-swift-run`,
				port,
				links: this.options.services,
				envs: this.options.services.length > 0 ? serviceEnvs : [],
				images: this.options.services
			});
			this._copyTemplateIfNotExists(FILENAME_DOCKERCOMPOSE_TOOLS, 'swift/docker-compose-tools.yml', {
				image: `${applicationName.toLowerCase()}-swift-run`,
				containerName: `${applicationName.toLowerCase()}-swift-run`,
				envs: this.options.services.length > 0 ? serviceEnvs : [],
				ports: [port],
				images: this.options.services

			});
		}


		this.fs.copy(
			this.templatePath('swift/dockerignore'),
			this.destinationPath('.dockerignore')
		);
	}

	_generateNodeJS() {
		const applicationName = Utils.sanitizeAlphaNum(this.bluemix.name);
		const dockerFileRun = this.options.services ? 'docker-compose.yml' : 'Dockerfile';
		const dockerFileTools = this.options.services ? 'docker-compose-tools.yml' : 'Dockerfile-tools';
		const port = this.options.port ? this.options.port : '3000';

		// Define metadata for all services that
		// require custom logic in Dockerfiles
		const services = require('./resources/node/services.json');

		// Get array with all the keys for the services objects
		const servKeys = Object.keys(services);
		const servicesPackages = [];
		const serviceEnvs = [];

		// Iterate over service keys to search for provisioned services and their environments
		for (let index in servKeys) {
			const servKey = servKeys[index];
			if (this.bluemix.hasOwnProperty(servKey)) {
				if (services[servKey].package) {
					servicesPackages.push(services[servKey].package);
				}
			}

			if(services[servKey].envs){
				serviceEnvs.push(services[servKey].envs);
			}
		}


		const cliConfig = {
			containerNameRun: `${applicationName.toLowerCase()}-express-run`,
			containerNameTools: `${applicationName.toLowerCase()}-express-tools`,
			hostPathRun: '.',
			hostPathTools: '.',
			containerPathRun: '/app',
			containerPathTools: '/app',
			containerPortMap: `${port}:${port}`,
			containerPortMapDebug: '9229:9229',
			dockerFileRun,
			dockerFileTools,
			imageNameRun: `${applicationName.toLowerCase()}-express-run`,
			imageNameTools: `${applicationName.toLowerCase()}-express-tools`,
			buildCmdRun: 'npm install --production --unsafe-perm',
			testCmd: 'npm run test',
			buildCmdDebug: 'npm install --unsafe-perm',
			runCmd: '',
			stopCmd: "npm stop",
			chartPath: `chart/${applicationName.toLowerCase()}`
		};

		this._copyTemplateIfNotExists(FILENAME_CLI_CONFIG, 'cli-config-common.yml', {cliConfig});

		this._copyTemplateIfNotExists(FILENAME_DOCKERFILE , 'node/Dockerfile', { port, servicesPackages });

		this._copyTemplateIfNotExists(FILENAME_DOCKERFILE_TOOLS, 'node/Dockerfile-tools', { port });

		this._copyTemplateIfNotExists(FILENAME_DOCKER_IGNORE, 'node/dockerignore', {});


		if(this.options.services){
			this._copyTemplateIfNotExists(FILENAME_DOCKERCOMPOSE, 'node/docker-compose.yml', {
				containerName: `${applicationName.toLowerCase()}-express-run`,
				image: `${applicationName.toLowerCase()}-express-run`,
				port,
				links: this.options.services,
				envs: this.options.services.length > 0 ? serviceEnvs : [],
				images: this.options.services
			});
			this._copyTemplateIfNotExists(FILENAME_DOCKERCOMPOSE_TOOLS, 'node/docker-compose-tools.yml', {
				image: `${applicationName.toLowerCase()}-express-run`,
				containerName: `${applicationName.toLowerCase()}-express-run`,
				envs: this.options.services.length > 0 ? serviceEnvs : [],
				images: this.options.services,
				ports: [port]

			});
		}


		if (this.fs.exists(this.destinationPath(FILENAME_DOCKER_IGNORE))){
			this.log(FILENAME_DOCKER_IGNORE, "already exists, skipping.");
		} else {
			this.fs.copyTpl(
				this.templatePath('node/dockerignore'),
				this.destinationPath('.dockerignore')
			);
		}
	}

	_generateJava() {
		if(!this.options.appName) {
			this.options.appName = Utils.sanitizeAlphaNum(this.bluemix.name);
		}
		let dir = this.bluemix.backendPlatform.toLowerCase();

		if (this.options.libertyVersion === 'beta') {
			this.options.libertyBeta = true
		}


		if(!this.options.platforms || this.options.platforms.includes('cli')) {
			/* Common cli-config template */
			if (this.fs.exists(this.destinationPath(FILENAME_CLI_CONFIG))){
				this.log(FILENAME_CLI_CONFIG, "already exists, skipping.");
			} else {
				this._writeHandlebarsFile(
					dir + '/cli-config.yml.template',
					FILENAME_CLI_CONFIG,
					this.options
				);
			}

			if (this.fs.exists(this.destinationPath(FILENAME_DOCKERFILE_TOOLS))){
				this.log(FILENAME_DOCKERFILE_TOOLS, "already exists, skipping.");
			} else {
				this._writeHandlebarsFile(
					dir + '/Dockerfile-tools.template',
					FILENAME_DOCKERFILE_TOOLS,
					this.options
				);
			}
		}

		if (this.fs.exists(this.destinationPath(FILENAME_DOCKERFILE))){
			this.log(FILENAME_DOCKERFILE, "already exists, skipping.");
		} else {
			this._writeHandlebarsFile(
				dir + '/Dockerfile.template',
				FILENAME_DOCKERFILE,
				this.options
			);
		}

		if (this.fs.exists(this.destinationPath(FILENAME_DOCKER_IGNORE))){
			this.log(FILENAME_DOCKER_IGNORE, "already exists, skipping.")
		} else {
			this._writeHandlebarsFile(
				dir + '/dockerignore.template',
				FILENAME_DOCKER_IGNORE,
				this.options
			);
		}
	}

	_writeHandlebarsFile(templateFile, destinationFile, data) {
		let template = this.fs.read(this.templatePath(templateFile));
		let compiledTemplate = Handlebars.compile(template);
		let output = compiledTemplate(data);
		this.fs.write(this.destinationPath(destinationFile), output);
	}

	_generatePython() {
		const applicationName = Utils.sanitizeAlphaNum(this.bluemix.name);
		const port = this.options.port ? this.options.port : '3000';
		const dockerFileRun = this.options.services ? 'docker-compose.yml' : 'Dockerfile';
		const dockerFileTools = this.options.services ? 'docker-compose-tools.yml' : 'Dockerfile-tools';

		// Define metadata for all services that
		// require custom logic in Dockerfiles
		const services = require('./resources/python/services.json');

		// Get array with all the keys for the services objects
		const servKeys = Object.keys(services);
		const servicesPackages = [];
		const serviceEnvs = [];

		// Iterate over service keys to search for provisioned services
		for (let index in servKeys) {
			const servKey = servKeys[index];
			if (this.bluemix.hasOwnProperty(servKey)) {
				if (services[servKey].package) {
					servicesPackages.push(services[servKey].package);
				}
			}

			if(services[servKey].envs){
				serviceEnvs.push(services[servKey].envs);
			}
		}

		const cliConfig = {
			containerNameRun: `${applicationName.toLowerCase()}-flask-run`,
			containerNameTools: `${applicationName.toLowerCase()}-flask-tools`,
			hostPathRun: '.',
			hostPathTools: '.',
			containerPathRun: '/app',
			containerPathTools: '/app',
			containerPortMap: `${port}:${port}`,
			containerPortMapDebug: '5858:5858',
			dockerFileRun,
			dockerFileTools,
			imageNameRun: `${applicationName.toLowerCase()}-flask-run`,
			imageNameTools: `${applicationName.toLowerCase()}-flask-tools`,
			buildCmdRun: 'python manage.py build',
			testCmd: this.options.enable
				? 'echo No test command specified in cli-config'
				: 'python manage.py test',
			buildCmdDebug: 'python manage.py build',
			runCmd: '',
			stopCmd: '',
			debugCmd: this.options.enable
				? 'echo No debug command specified in cli-config'
				: 'python manage.py debug',
			chartPath: `chart/${applicationName.toLowerCase()}`
		};

		if(this.options.services.length > 0){
			this._copyTemplateIfNotExists(FILENAME_DOCKERCOMPOSE, 'python/docker-compose.yml', {
				containerName: `${applicationName.toLowerCase()}-flask-run`,
				image: `${applicationName.toLowerCase()}-flask-run`,
				port,
				links: this.options.services,
				envs: this.options.services.length > 0 ? serviceEnvs : [],
				images: this.options.services
			});
			this._copyTemplateIfNotExists(FILENAME_DOCKERCOMPOSE_TOOLS, 'python/docker-compose-tools.yml', {
				image: `${applicationName.toLowerCase()}-flask-run`,
				containerName: `${applicationName.toLowerCase()}-flask-run`,
				ports: [port],
				images: this.options.services

			});
		}

		if (this.fs.exists(this.destinationPath(FILENAME_CLI_CONFIG))){
			this.log(FILENAME_CLI_CONFIG, "already exists, skipping.");
		} else {
			this.fs.copyTpl(
				this.templatePath('cli-config-common.yml'),
				this.destinationPath(FILENAME_CLI_CONFIG), {
					cliConfig
				}
			);
		}

		if (this.fs.exists(this.destinationPath(FILENAME_DOCKERFILE))){
			this.log(FILENAME_DOCKERFILE, "already exists, skipping.");
		} else {
			this.fs.copyTpl(
				this.templatePath('python/Dockerfile'),
				this.destinationPath(FILENAME_DOCKERFILE), {
					port: port,
					enable: this.options.enable,
					language: this.bluemix.backendPlatform,
					name: this.bluemix.name,
					servicesPackages: servicesPackages
				}
			);
		}

		if (this.fs.exists(this.destinationPath(FILENAME_DOCKERFILE_TOOLS))){
			this.log(FILENAME_DOCKERFILE_TOOLS, "already exists, skipping.");
		} else {
			this.fs.copyTpl(
				this.templatePath('python/Dockerfile-tools'),
				this.destinationPath(FILENAME_DOCKERFILE_TOOLS), {
					servicesPackages: servicesPackages,
					language: this.bluemix.backendPlatform,
					name: this.bluemix.name
				}
			);
		}

		const FILENAME_MANAGEMENT = "manage.py";
		if (!this.options.enable) {
			if (this.fs.exists(this.destinationPath(FILENAME_MANAGEMENT))){
				this.log(FILENAME_MANAGEMENT, "already exists, skipping.");
			} else {
				this.fs.copy(
					this.templatePath('python/manage.py'),
					this.destinationPath(FILENAME_MANAGEMENT)
				);
			}
		}

		this.fs.copy(
			this.templatePath('python/dockerignore'),
			this.destinationPath('.dockerignore')
		);

		if(this.options.services.length > 0){
			this._copyTemplateIfNotExists(FILENAME_DOCKERCOMPOSE, 'python/docker-compose.yml', {
				containerName: `${applicationName.toLowerCase()}-express-run`,
				image: `${applicationName.toLowerCase()}-express-run`,
				port,
				links: this.options.services,
				envs: this.options.services.length > 0 ? serviceEnvs : [],
				images: this.options.services
			});
			this._copyTemplateIfNotExists(FILENAME_DOCKERCOMPOSE_TOOLS, 'python/docker-compose-tools.yml', {
				image: `${applicationName.toLowerCase()}-express-run`,
				containerName: `${applicationName.toLowerCase()}-express-run`,
				envs: this.options.services.length > 0 ? serviceEnvs : [],
				images: this.options.services,
				ports: [port]

			});
		}

	}

	_generateDjango() {
		const applicationName = Utils.sanitizeAlphaNum(this.bluemix.name);
		const port = this.options.port ? this.options.port : '3000';

		const dockerFileRun = this.options.services ? 'docker-compose.yml' : 'Dockerfile';
		const dockerFileTools = this.options.services ? 'docker-compose-tools.yml' : 'Dockerfile-tools';

		// Define metadata for all services that
		// require custom logic in Dockerfiles
		const services = require('./resources/python/services.json');

		// Get array with all the keys for the services objects
		const servKeys = Object.keys(services);
		const servicesPackages = [];
		const serviceEnvs = [];

		// Iterate over service keys to search for provisioned services
		for (let index in servKeys) {
			const servKey = servKeys[index];
			if (this.bluemix.hasOwnProperty(servKey)) {
				if (services[servKey].package) {
					servicesPackages.push(services[servKey].package);
				}
			}

			if(services[servKey].envs){
				serviceEnvs.push(services[servKey].envs);
			}
		}


		const cliConfig = {
			containerNameRun: `${applicationName.toLowerCase()}-django-run`,
			containerNameTools: `${applicationName.toLowerCase()}-django-tools`,
			hostPathRun: '.',
			hostPathTools: '.',
			containerPathRun: '/app',
			containerPathTools: '/app',
			containerPortMap: `${port}:${port}`,
			containerPortMapDebug: '5858:5858',
			dockerFileRun,
			dockerFileTools,
			imageNameRun: `${applicationName.toLowerCase()}-django-run`,
			imageNameTools: `${applicationName.toLowerCase()}-django-tools`,
			buildCmdRun: 'python -m compileall .',
			testCmd: this.options.enable
				? 'echo No test command specified in cli-config'
				: 'python manage.py test',
			buildCmdDebug: 'python -m compileall .',
			runCmd: '',
			stopCmd: '',
			debugCmd: this.options.enable
				? 'echo No debug command specified in cli-config'
				: `python manage.py runserver --noreload`,
			chartPath: `chart/${applicationName.toLowerCase()}`
		};

		if (this.fs.exists(this.destinationPath(FILENAME_CLI_CONFIG))){
			this.log(FILENAME_CLI_CONFIG, "already exists, skipping.");
		} else {
			this.fs.copyTpl(
				this.templatePath('cli-config-common.yml'),
				this.destinationPath(FILENAME_CLI_CONFIG), {
					cliConfig
				}
			);
		}

		if (this.fs.exists(this.destinationPath(FILENAME_DOCKERFILE))){
			this.log(FILENAME_DOCKERFILE, "already exists, skipping.");
		} else {
			this.fs.copyTpl(
				this.templatePath('python/Dockerfile'),
				this.destinationPath(FILENAME_DOCKERFILE), {
					port: port,
					enable: this.options.enable,
					servicesPackages: servicesPackages,
					language: this.bluemix.backendPlatform,
					name: this.bluemix.name
				}
			);
		}

		if (this.fs.exists(this.destinationPath(FILENAME_DOCKERFILE_TOOLS))){
			this.log(FILENAME_DOCKERFILE_TOOLS, "already exists, skipping.");
		} else {
			this.fs.copyTpl(
				this.templatePath('python/Dockerfile-tools'),
				this.destinationPath(FILENAME_DOCKERFILE_TOOLS), {
					servicesPackages: servicesPackages,
					language: this.bluemix.backendPlatform,
					name: this.bluemix.name
				}
			);
		}

		if(this.options.services.length > 0){
			this._copyTemplateIfNotExists(FILENAME_DOCKERCOMPOSE, 'python/docker-compose.yml', {
				containerName: `${applicationName.toLowerCase()}-express-run`,
				image: `${applicationName.toLowerCase()}-django-run`,
				port,
				links: this.options.services,
				envs: this.options.services.length > 0 ? serviceEnvs : [],
				images: this.options.services
			});
			this._copyTemplateIfNotExists(FILENAME_DOCKERCOMPOSE_TOOLS, 'python/docker-compose-tools.yml', {
				image: `${applicationName.toLowerCase()}-django-run`,
				containerName: `${applicationName.toLowerCase()}-django-run`,
				envs: this.options.services.length > 0 ? serviceEnvs : [],
				images: this.options.services,
				ports: [port]

			});
		}


		this.fs.copy(
			this.templatePath('python/dockerignore'),
			this.destinationPath('.dockerignore')
		);
	}

	_copyTemplateIfNotExists(targetFileName, sourceTemplatePath, ctx) {
		if (this.fs.exists(this.destinationPath(targetFileName))){
			this.log(targetFileName, "already exists, skipping.");
		} else {
			this.fs.copyTpl(
				this.templatePath(sourceTemplatePath),
				this.destinationPath(targetFileName),
				ctx
			);
		}

	}
};
