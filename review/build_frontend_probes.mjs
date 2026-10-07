import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {realpathSync} from 'node:fs';
const require=createRequire(realpathSync(resolve('app/node_modules/vite/package.json')));
await require('esbuild').build({entryPoints:['review/review_frontend_probes.tsx'],outfile:'review/frontend-probes.cjs',bundle:true,platform:'node',format:'cjs',jsx:'automatic',nodePaths:[resolve('app/node_modules')],logLevel:'warning'});
