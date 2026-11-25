# Imagem promocional pequena da Chrome Web Store (440x280).
# Uso: python3 scripts/promocional.py <saída.png>
import sys, textwrap
from PIL import Image, ImageDraw, ImageFont

F = '/usr/share/fonts/truetype/dejavu/DejaVuSans'
im = Image.new('RGB', (440, 280), (29, 79, 145))
icone = Image.open('ext/icons/icon-128.png').convert('RGBA').resize((96, 96), Image.LANCZOS)
im.paste(icone, (36, 92), icone)
d = ImageDraw.Draw(im)
d.text((152, 98), 'Jamegão', font=ImageFont.truetype(F + '-Bold.ttf', 38), fill='white')
texto_f = ImageFont.truetype(F + '.ttf', 15)
y = 150
for linha in textwrap.wrap('Assinatura no e-SAJ e no PJe com certificado A1, sem instalar programa.', 30):
    d.text((154, y), linha, font=texto_f, fill=(214, 226, 243)); y += 22
im.save(sys.argv[1])
