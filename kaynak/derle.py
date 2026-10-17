"""kaynak/ui.html + kaynak/motor.js -> index.html (tek dosya uygulama)"""
import os
k = os.path.dirname(os.path.abspath(__file__))
m = open(os.path.join(k, 'motor.js'), encoding='utf-8').read()
m = m.replace("if (typeof module !== 'undefined') module.exports = parcalaMotoru;", '')
m = '\n'.join(l for l in m.split('\n') if 'PDEBUG' not in l)
u = open(os.path.join(k, 'ui.html'), encoding='utf-8').read()
assert '/*MOTOR*/' in u
govde = u.replace('/*MOTOR*/', m)
sayfa = ('<!doctype html><html lang="tr"><head><meta charset="utf-8">'
         '<meta name="viewport" content="width=device-width,initial-scale=1">'
         '</head><body>' + govde + '</body></html>')
open(os.path.join(k, '..', 'index.html'), 'w', encoding='utf-8').write(sayfa)
print('index.html yazıldı', len(sayfa))
