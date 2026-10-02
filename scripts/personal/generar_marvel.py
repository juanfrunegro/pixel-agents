"""Personal (copia de juanfrunegro), tanda 5: genera las skins de Marvel (solo estética, core/src/skinsMarvel.ts)
recoloreando char_0.png por partes (pelo, cara, ojos, camisa, saco, pantalón, zapatos) y agregando detalles (telaraña,
antifaz, hombros de Hulk, martillo de Thor). Mismo formato que char_N.png: 112x96, 7 cuadros x abajo/arriba/derecha.

Uso (Python con Pillow):  python scripts/personal/generar_marvel.py [--vista previa.png]
Salida: webview-ui/public/assets/marvel/<id>.png
"""
from PIL import Image
import os, sys
REPO=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
base=Image.open(os.path.join(REPO,'webview-ui','public','assets','characters','char_0.png')).convert('RGBA')
W,H=base.size  # 112x96: 7 frames x 3 dirs
HAIR={'#32191d','#b18649','#8f6439','#6d4726','#341f20','#6f4a2a'}
SKIN={'#e9a384','#c5896e','#fbbf97','#ffd8b2','#e29878','#84523a'}
JACKET={'#071c2e','#1164a9','#114978','#0f406a','#9f9f9f'}
JACKET_BORDE={'#071c2e','#0f406a','#9f9f9f'}  # P V U: bordes y mangas
TIE={'#040605'}
WHITE='#ffffff'
PUPIL={'#4f4f4f'}
SHOES={'#353535','#595959','#1a1a1a'}
hx=lambda p:'#%02x%02x%02x'%p[:3]
def lum(c):
    r,g,b=[int(c[i:i+2],16) for i in (1,3,5)]
    return 0.299*r+0.587*g+0.114*b+1
def rgb(c): return tuple(int(c[i:i+2],16) for i in (1,3,5))
def tono(dst,src,ref):
    f=max(0.5,min(1.35,lum(src)/lum(ref)))
    return tuple(max(0,min(255,round(v*f))) for v in rgb(dst))
REF={'pelo':'#8f6439','cara':'#e9a384','manos':'#e9a384','camisa':WHITE,'saco':'#114978','borde':'#0f406a','pantalon':'#114978','corbata':'#040605','zapatos':'#353535','ojo':WHITE,'pupila':'#4f4f4f'}
HEROES={
 'hulk':    dict(pelo='#26201f',cara='#6fb34a',manos='#6fb34a',camisa='#6fb34a',corbata='#4e8a33',saco='#6c3fa3',borde='#4d2a7d',pantalon='#5a3390',zapatos=None,ancho=True),
 'spiderman':dict(pelo='#d0222c',cara='#d0222c',manos='#d0222c',ojo='#f4f4f4',pupila='#f4f4f4',camisa='#d0222c',corbata='#111111',saco='#d0222c',borde='#2350c8',pantalon='#2350c8',zapatos='#b81d26',telarana=True),
 'ironman': dict(pelo='#b51f28',cara='#e3b432',manos='#b51f28',ojo='#a8f4ff',pupila='#a8f4ff',camisa='#e3b432',corbata='#c8faff',saco='#b51f28',borde='#8e1820',pantalon='#9c1a22',zapatos='#e3b432'),
 'thor':    dict(pelo='#ecc35a',camisa='#c0c6cf',corbata='#737b88',saco='#2c3546',borde='#b51f28',pantalon='#262a33',martillo=True),
 'deadpool':dict(pelo='#b31d24',cara='#b31d24',manos='#1b1b1b',ojo='#f4f4f4',pupila='#f4f4f4',camisa='#1b1b1b',corbata='#1b1b1b',saco='#b31d24',borde='#1b1b1b',pantalon='#9c1a20',zapatos='#1b1b1b',antifaz=True),
}
def generar(h):
    out=base.copy(); px=out.load(); src=base.load()
    for fy in range(3):
        for fx in range(7):
            x0,y0=fx*16,fy*32
            cel=[[hx(src[x0+x,y0+y]) if src[x0+x,y0+y][3] else None for x in range(16)] for y in range(32)]
            saco=[y for y in range(32) if any(c in JACKET for c in cel[y])]
            ini=saco[0] if saco else 32
            cint=[y for y in range(ini,32) if sum(1 for c in cel[y] if c=='#071c2e')>=6]
            cin=cint[0] if cint else 32
            for y in range(32):
                for x in range(16):
                    c=cel[y][x]
                    if c is None: continue
                    rol=None
                    if c in HAIR: rol='pelo'
                    elif c in SKIN: rol='cara' if y<ini else 'manos'
                    elif c==WHITE: rol='ojo' if y<ini else 'camisa'
                    elif c in PUPIL: rol='pupila'
                    elif c in TIE: rol='corbata'
                    elif c in JACKET: rol='pantalon' if y>cin else ('borde' if c in JACKET_BORDE else 'saco')
                    elif c in SHOES: rol='zapatos'
                    d=h.get(rol) if rol else None
                    if d:
                        a=src[x0+x,y0+y][3]
                        px[x0+x,y0+y]=tono(d,c,REF[rol])+(a,)
            if h.get('telarana'):  # Spider-Man: líneas de telaraña en la máscara
                for y in range(32):
                    for x in range(16):
                        c=cel[y][x]
                        if c and (c in HAIR or (c in SKIN and y<ini)) and (x%4==1 or y%4==1) and c not in ('#32191d','#341f20'):
                            r,g,b,a=px[x0+x,y0+y]; px[x0+x,y0+y]=(int(r*0.62),int(g*0.62),int(b*0.62),a)
            if h.get('antifaz'):  # parches negros alrededor de los ojos
                for y in range(ini):
                    for x in range(16):
                        if cel[y][x]==WHITE:
                            for dx in (-1,1):
                                xx=x+dx
                                if 0<=xx<16 and cel[y][xx] in SKIN: px[x0+xx,y0+y]=(27,27,27,255)
            if h.get('ancho'):  # Hulk: hombros y torso un pixel más anchos de cada lado
                for y in range(ini,cin):
                    xs=[x for x in range(16) if px[x0+x,y0+y][3]]
                    if not xs: continue
                    for x,dx in ((min(xs),-1),(max(xs),1)):
                        xx=x+dx
                        if 0<=xx<16 and px[x0+xx,y0+y][3]==0: px[x0+xx,y0+y]=(40,62,30,255)
            if h.get('martillo') and fy in (0,2):  # Mjolnir junto a la mano
                manos=[(x,y) for y in range(ini,32) for x in range(16) if cel[y][x] in SKIN]
                if manos:
                    mx,my=max(manos)  # mano más a la derecha
                    pts=[(mx+1,my+1),(mx+1,my+2)]  # mango
                    cab=[(mx,my+3),(mx+1,my+3),(mx+2,my+3),(mx,my+4),(mx+1,my+4),(mx+2,my+4)]
                    for (x,y),col in [(p,(110,72,40,255)) for p in pts]+[(p,(150,156,166,255)) for p in cab]:
                        if 0<=x<16 and 0<=y<32 and px[x0+x,y0+y][3]==0: px[x0+x,y0+y]=col
    return out
dst=os.path.join(REPO,'webview-ui','public','assets','marvel')
os.makedirs(dst,exist_ok=True)
imgs=[('normal',base)]
for n,h in HEROES.items():
    im=generar(h); im.save(os.path.join(dst,n+'.png')); imgs.append((n,im))
# vista previa ampliada (opcional, --vista archivo.png): por personaje, frames 0,3,5 de cada dirección
Z=6
prev=Image.new('RGBA',(len(imgs)*(16*3+4)*Z, 3*32*Z),(40,40,48,255))
for i,(n,im) in enumerate(imgs):
    for fy in range(3):
        for k,fx in enumerate((0,3,5)):
            cel=im.crop((fx*16,fy*32,fx*16+16,fy*32+32)).resize((16*Z,32*Z),Image.NEAREST)
            prev.alpha_composite(cel,(i*(16*3+4)*Z+k*16*Z,fy*32*Z))
if '--vista' in sys.argv: prev.save(sys.argv[sys.argv.index('--vista')+1])
print('ok', [n for n,_ in imgs])
