(()=>{
'use strict';
const R={
'gpt-5.6-sol':{i:4,c:.4,o:20,w:5},'gpt-5.6-terra':{i:2,c:.2,o:12,w:2.5},'gpt-5.6-luna':{i:.2,c:.02,o:1.2,w:.25},
'claude-fable-5-1':{i:10,c:.25,o:50,w:12.5},'claude-sonnet-5':{i:2,c:.2,o:10,w:2.5},'claude-opus-5':{i:5,c:.5,o:25,w:6.25},'claude-sonnet-4-6':{i:3,c:.3,o:15,w:3.75},
'gemini-3.8-flash':{i:.75,c:.075,o:3.75,w:.75},'gemini-3.7-flash':{i:.75,c:.075,o:3.75,w:.75}
};
function rates(model,input=0){if(model==='gemini-3.1-pro-preview')return input>200000?{i:4,c:1,o:18,w:4}:{i:2,c:.5,o:12,w:2};return R[model]||null}
function estimate(u){if(!u)return 0;let r=rates(u.model,Number(u.input)||0);if(!r)return 0;if(/^gpt-5\.6-/.test(String(u.model||''))&&Number(u.input||0)>272000)r={...r,i:r.i*2,c:r.c*2,o:r.o*1.5,w:r.w*2};const input=Number(u.input)||0,cached=Math.min(Number(u.cached)||0,input),normal=Math.max(0,input-cached),write=Number(u.cacheWrite)||0,output=Number(u.output)||0;return(normal*r.i+cached*r.c+write*r.w+output*r.o)/1e6}
window.MCLCostRatesV2={rates,estimate};
})();