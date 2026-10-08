from PIL import Image

src = r"C:\Users\tsemp\.cursor\projects\c-TeamSuite\assets\c__Users_tsemp_AppData_Roaming_Cursor_User_workspaceStorage_3e20264b51e8cf885eaf041be1df3055_images_image-acf69b84-b7dd-4716-80a7-5b44de15f3c6.png"
dst = r"C:\TeamSuite\src\assets\header-brand-icon.png"

img = Image.open(src).convert("RGBA")
pixels = img.load()
w, h = img.size

corners = [
    pixels[0, 0],
    pixels[w - 1, 0],
    pixels[0, h - 1],
    pixels[w - 1, h - 1],
    pixels[2, 2],
    pixels[w - 3, 2],
    pixels[2, h - 3],
    pixels[w - 3, h - 3],
]
avg = tuple(sum(c[i] for c in corners) // len(corners) for i in range(3))
print("bg approx", avg, "size", w, h)


def near_bg(r: int, g: int, b: int, a: int) -> bool:
    if a < 8:
        return True
    dr = abs(r - avg[0])
    dg = abs(g - avg[1])
    db = abs(b - avg[2])
    if dr + dg + db < 55 and max(r, g, b) < 70:
        return True
    if r < 35 and g < 45 and b < 70 and abs(b - r) < 45:
        sat = max(r, g, b) - min(r, g, b)
        if sat < 28:
            return True
    return False


out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
op = out.load()
removed = 0
for y in range(h):
    for x in range(w):
        r, g, b, a = pixels[x, y]
        if near_bg(r, g, b, a):
            op[x, y] = (0, 0, 0, 0)
            removed += 1
        else:
            op[x, y] = (r, g, b, a)

bbox = out.getbbox()
if bbox:
    pad = 4
    left, top, right, bottom = bbox
    left = max(0, left - pad)
    top = max(0, top - pad)
    right = min(w, right + pad)
    bottom = min(h, bottom + pad)
    out = out.crop((left, top, right, bottom))

out.save(dst, "PNG")
print("saved", dst, "removed", removed, "final", out.size)
