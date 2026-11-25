# Compõe as capturas das lojas (1280x800) a partir das imagens cruas de
# scripts/capturas.mjs. Uso: python3 scripts/compor-capturas.py <cruas> <saída>
import sys, textwrap
from PIL import Image, ImageDraw, ImageFont, ImageFilter

cru, saida = sys.argv[1], sys.argv[2]
F = '/usr/share/fonts/truetype/dejavu/DejaVuSans'
titulo_f = ImageFont.truetype(F + '-Bold.ttf', 40)
texto_f = ImageFont.truetype(F + '.ttf', 24)

ITENS = [
    ('1-assinatura.png', 'cru-assinatura.png', 'Você confirma cada lote',
     'Antes de assinar, o Jamegão mostra o site, quantos documentos e com qual certificado. A senha do cofre é pedida na mesma janela.'),
    ('2-site.png', 'cru-site.png', 'Só os sites que você autoriza',
     'Na primeira vez, o e-SAJ precisa da sua permissão para ver os certificados importados.'),
    ('3-popup.png', 'cru-popup.png', 'Tudo à vista no ícone',
     'Trave o cofre, veja a validade dos certificados, decida, site a site, quem pode usá-los e ligue o PJe.'),
    ('3-popup-firefox.png', 'cru-popup-firefox.png', 'Tudo à vista no ícone',
     'Trave o cofre, veja a validade dos certificados, decida, site a site, quem pode usá-los e ligue o PJe.'),
    ('4-importar.png', 'cru-importar.png', 'Importe o PFX uma vez',
     'A chave fica cifrada no navegador, protegida pela senha do cofre. Nada é enviado a servidor algum.'),
]

for nome, origem, titulo, texto in ITENS:
    W, H = 1280, 800
    img = Image.new('RGB', (W, H), '#eef2f7')
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 12, H], fill='#1d4f91')
    y = 250
    for linha in textwrap.wrap(titulo, 18, break_on_hyphens=False):
        d.text((70, y), linha, font=titulo_f, fill='#16233a'); y += 54
    y += 20
    for linha in textwrap.wrap(texto, 30, break_on_hyphens=False):
        d.text((70, y), linha, font=texto_f, fill='#34445c'); y += 36
    d.text((70, H - 80), 'Jamegão', font=ImageFont.truetype(F + '-Bold.ttf', 26), fill='#1d4f91')

    shot = Image.open(f'{cru}/{origem}').convert('RGB')
    caixa_w, caixa_h = 640, 700
    esc = min(caixa_w / shot.width, caixa_h / shot.height, 1.0)
    shot = shot.resize((int(shot.width * esc), int(shot.height * esc)), Image.LANCZOS)
    pad = 28
    cw, ch = shot.width + 2 * pad, shot.height + 2 * pad
    x0 = 540 + (700 - cw) // 2
    y0 = (H - ch) // 2
    sombra = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(sombra).rounded_rectangle([x0 + 6, y0 + 10, x0 + cw + 6, y0 + ch + 10], 18, fill=(20, 40, 70, 70))
    img.paste(sombra.filter(ImageFilter.GaussianBlur(14)), (0, 0), sombra.filter(ImageFilter.GaussianBlur(14)))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([x0, y0, x0 + cw, y0 + ch], 18, fill='white', outline='#d5dce6')
    img.paste(shot, (x0 + pad, y0 + pad))
    img.save(f'{saida}/{nome}')
    print(nome, img.size)
