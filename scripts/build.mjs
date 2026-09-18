import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
const root=dirname(dirname(fileURLToPath(import.meta.url))),out=join(root,'dist');
await mkdir(out,{recursive:true});
let html=await readFile(join(root,'public/index.html'),'utf8');
const css=await readFile(join(root,'public/styles.css'),'utf8');
html=html.replace('<link rel="stylesheet" href="styles.css">',`<style>\n${css}\n</style>`);
for(const file of ['data','engine','storage','map','app']){
 const js=await readFile(join(root,`public/js/${file}.js`),'utf8');
 html=html.replace(`<script src="js/${file}.js" defer></script>`,'');
 html=html.replace('</body>',`<script>\n${js.replace(/<\/script/gi,'<\\/script')}\n</script>\n</body>`);
}
await writeFile(join(out,'index.html'),html);
console.log('已生成 dist/index.html：单文件经典版可直接打开；AI 模式请用 npm start。');
