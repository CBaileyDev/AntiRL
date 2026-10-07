import { createServer } from '../app/node_modules/vite/dist/node/index.js';
import react from '../app/node_modules/@vitejs/plugin-react/dist/index.js';
import path from 'node:path';
const app=path.resolve('app/node_modules');
const server=await createServer({root:process.cwd(),cacheDir:path.resolve('review/.vite'),configFile:false,plugins:[react()],resolve:{alias:{react:path.join(app,'react'),'react-dom':path.join(app,'react-dom')}},server:{host:'127.0.0.1',port:1445,strictPort:true,fs:{allow:[process.cwd()]}},publicDir:path.resolve('app/public')});
await server.listen();console.log('Review harness http://127.0.0.1:1445/review/harness/index.html');
