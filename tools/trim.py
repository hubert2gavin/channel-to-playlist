import sys; from PIL import Image
im=Image.open(sys.argv[1]).convert('RGB'); w,h=im.size; bg=im.getpixel((w-2,h-2)); y=h-1
while y>0 and all(im.getpixel((x,y))==bg for x in range(0,w,4)): y-=1
im.crop((0,0,w,min(h,y+14))).save(sys.argv[2])
