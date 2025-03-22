# AnimatedTransformer

Recommended dependendies:

- Install node `v22` using the [nvm](https://github.com/nvm-sh/nvm) tool: `$ nvm install v22`
  - Set the default to be this version: `nvm alias default v22`
- \[optional\] Install globally the Angular 19+ CLI with `$ npm install -g @angular/cli` so that you can directly use `ng` commands, otherwise you have to use `npx ng`.

## Development server

First time setup:

- Clone this repo: `git clone https://github.com/PAIR-code/tiny-transformers.git`.
- Change into the right subdirectory: `cd tiny-transformers/animated-transformer`
- Install dependencies: `npm install`

Start a dev sever with `npm run start`.

Navigate to `http://localhost:4200/`. The app will automatically reload if you
change any of the source files.

NOTE: The dev server listens on 127.0.0.1 (aka `localhost`). If you intend to
access the dev server from another machine, you'll need to tunnel the traffic
using `ssh`'s `-L` flag.

In additon to the angular build server, the current setup assumes an additional
server on port `9000`, that serves some library JS files for web-workers to
import. This get started by `npm run start`, but it can also be started
seperately if you want via the command: 

```sh
npx ts-node src/weblab-examples/build.script.ts --mode=serve
```

This combination allows scripts `src/weblab-examples/` to be served at `http://localhost:4200/scripts/`

And in particular, `lib.worker.js` to be served so that it can be imported into
WebWorkers with: 

```ts
importScripts('/scripts/lib.worker.js');
```

## Adding an icon

1. Download the SVG of an icon, e.g. from: https://fonts.google.com/icons into
   the `src/assets/icons` directory, e.g. the [`settings`](https://fonts.google.com/icons?selected=Material+Symbols+Outlined:settings:FILL@0;wght@400;GRAD@0;opsz@24&icon.size=24&icon.color=%235f6368) icon.
1. Import `MatIconModule` and `addIcons` to then let you use the
   `addIcons` function inside the constructor: 
    
```ts
import { addIcons } from 'src/app/icon-registry';
import { MatIconModule } from '@angular/material/icon';

// Inside of your component's constuctor(...) { ...
  addIcons(['settings']);
```


## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can
also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the
`dist/` directory. Use the `--prod` flag for a production build.

## Running unit tests

Run `ng test` to execute the unit tests via
[Karma](https://karma-runner.github.io).

`ng test --browsers ChromeHeadless`

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via
[Protractor](http://www.protractortest.org/).

## Further help

To get more help on the Angular CLI use `ng help` or go check out the
[Angular CLI Overview and Command Reference](https://angular.io/cli) page.

## Contributing to the repository

If you want to contribute to the repository, feel free to take an unassigned issue and assign to yourself, and then send a pull request to 
iislucas@.

When merging your changes into main, please make sure to use the "squash and merge" strategy, so that the final change is a single one linked to your pull request.