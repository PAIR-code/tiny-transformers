# AnimatedTransformer

Recommended dependendies:

- Install node `v20.14.0` using the [nvm](https://github.com/nvm-sh/nvm) tool: `$ nvm install v20.14.0`
  - Set the default to be this version: `nvm alias default v20.14.0`
- Install globally the Angular 18 CLI with `$ npm install -g @angular/cli`

## Development server

First time setup:

- Clone this repo: `git clone https://github.com/PAIR-code/tiny-transformers.git`.
- Change into the right subdirectory: `cd tiny-transformers/animated-transformer`
- Install dependencies: `npm install`

Start a dev sever with `npm start`.

Navigate to `http://localhost:4200/`. The app will automatically reload if you
change any of the source files.

NOTE: The dev server listens on 127.0.0.1. If you intend to access the
dev server from another machine, you'll need to tunnel the traffic using `ssh`'s
`-L` flag.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can
also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the
`dist/` directory. Use the `--prod` flag for a production build.

## Running unit tests

Run `ng test` to execute the unit tests via
[Karma](https://karma-runner.github.io).

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via
[Protractor](http://www.protractortest.org/).

## Further help

To get more help on the Angular CLI use `ng help` or go check out the
[Angular CLI Overview and Command Reference](https://angular.io/cli) page.
