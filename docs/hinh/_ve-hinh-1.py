F='font-family="-apple-system,Segoe UI,Arial,sans-serif"'
LLM=("#EEF5E6","#A8CC86","#3B6D11"); TOOL=("#EFEEFC","#B9B4EE","#4A42A8"); PILL=("#FBEEE9","#F0A98F","#993C1D"); GREY="#8A8984"; INK="#444441"
D=f'<defs><marker id="a" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke="{GREY}" stroke-width="1.4"/></marker></defs>'
def t(x,y,s,size=11,anchor="middle",col=GREY,w=400,italic=False):
    it=' font-style="italic"' if italic else ''
    return f'<text x="{x}" y="{y}" text-anchor="{anchor}" dominant-baseline="central" {F} font-size="{size}" font-weight="{w}" fill="{col}"{it}>{s}</text>'
def node(x,y,w,label,c,pill=False,h=28):
    f,st,tx=c; rx=h/2 if pill else 2
    return f'<rect x="{x}" y="{y-h/2}" width="{w}" height="{h}" rx="{rx}" fill="{f}" stroke="{st}" stroke-width="1"/>'+t(x+w/2,y,label,11,col=tx,w=500)
def line(d,dash=None,two=False):
    da=f' stroke-dasharray="{dash}"' if dash else ''; ms=' marker-start="url(#a)"' if two else ''
    return f'<path d="{d}" fill="none" stroke="{GREY}" stroke-width="1"{da}{ms} marker-end="url(#a)"/>'
def swatch(x,y,c,pill=False): return f'<rect x="{x}" y="{y-5}" width="10" height="10" rx="{5 if pill else 2}" fill="{c[0]}" stroke="{c[1]}"/>'
Y=70
spec=[("Câu hỏi",PILL,True,56),("Hiểu &amp; chọn",LLM,False,82),("Có dữ liệu?",TOOL,False,76),("Tính số",TOOL,False,60),("Viết insight",LLM,False,76),("Kiểm tra lỗi",TOOL,False,78),("Trả lời",PILL,True,56)]
gap=(680-40-sum(s[3] for s in spec))/(len(spec)-1)
xs=[];x=20
for s in spec: xs.append(x); x+=s[3]+gap
cx=lambda i: xs[i]+spec[i][3]/2
g=[D]
for (lab,c,p,w),x in zip(spec,xs): g.append(node(x,Y,w,lab,c,p))
for i in range(len(spec)-1): g.append(line(f"M{xs[i]+spec[i][3]+4} {Y} L{xs[i+1]-4} {Y}"))
g.append(t((xs[2]+spec[2][3]+xs[3])/2,Y-12,"Pass",10)); g.append(t((xs[5]+spec[5][3]+xs[6])/2,Y-12,"Pass",10))
TY=Y+84
g.append(node(cx(1)-62,TY,124,"Tìm chỉ tiêu phù hợp",TOOL))
g.append(line(f"M{cx(1)} {Y+18} L{cx(1)} {TY-18}",dash="2 3",two=True))
g.append(t(cx(1)+8,Y+36,"Gửi ý cần tìm /",10,"start")); g.append(t(cx(1)+8,Y+49,"Nhận danh sách chỉ tiêu",10,"start"))
ex=cx(2)+70
g.append(line(f"M{cx(2)+10} {Y+16} L{ex} {TY-16}",dash="4 3"))
g.append(t(cx(2)+52,Y+28,"Fail",10))
g.append(node(ex-40,TY,122,"Báo: không có dữ liệu",PILL,True))
g.append(line(f"M{cx(5)} {Y-16} C {cx(5)} {Y-54}, {cx(4)} {Y-54}, {cx(4)} {Y-18}",dash="4 3"))
g.append(t((cx(4)+cx(5))/2,Y-52,"Fail: viết lại",10))
EX,EY,EW,EH=20,TY+34,464,96
g.append(f'<rect x="{EX}" y="{EY}" width="{EW}" height="{EH}" rx="2" fill="#FFFFFF" stroke="{TOOL[1]}" stroke-dasharray="3 2"/>')
g.append(line(f"M{cx(1)} {TY+14} L{cx(1)} {EY-2}",dash="2 3"))
g.append(t(EX+10,EY+14,"Ví dụ 1 — danh sách chỉ tiêu (câu hỏi về thu nhập theo tỉnh)",10,"start",INK,600))
for k,(i,n,r) in enumerate([("a1","Thu nhập bình quân một lao động đang làm việc","63 tỉnh · 2018–2024"),("a2","Thu nhập bình quân đầu người một tháng","63 tỉnh · 2010–2018"),("a3","…","")]):
    y=EY+32+k*15
    g.append(t(EX+10,y,i,10,"start",TOOL[2],600)); g.append(t(EX+32,y,n,10,"start",INK)); g.append(t(EX+EW-10,y,r,10,"end",GREY))
g.append(t(EX+10,EY+EH-12,"Mỗi dòng là một chỉ tiêu (một cột số trong một bảng). LLM chọn mã dòng, vd “a1”, hoặc “không có”.",10,"start",GREY,italic=True))
E2X,E2Y,E2W=20,EY+EH+16,640
rows=[(TOOL,"Tính số","1995–2013: tăng 17% · 2013–2024: giảm 10%",INK),
      (LLM,"Viết insight (lần 1)","“Diện tích lúa giảm từ 6,77 triệu ha xuống còn 7,13 triệu ha.”",INK),
      (TOOL,"Kiểm tra lỗi","✗ Câu nói “giảm” nhưng 7,13 lớn hơn 6,77 → trả về viết lại","#A32D2D"),
      (LLM,"Viết insight (lần 2)","“Diện tích lúa tăng 17% từ 1995 đến 2013, rồi giảm 10% đến 2024.”",INK),
      (TOOL,"Kiểm tra lỗi","✓ Hướng tăng/giảm khớp với số đã tính → trả lời","#3B6D11")]
E2H=30+len(rows)*17+8
g.append(f'<rect x="{E2X}" y="{E2Y}" width="{E2W}" height="{E2H}" rx="2" fill="#FFFFFF" stroke="{TOOL[1]}" stroke-dasharray="3 2"/>')
g.append(line(f"M{cx(5)} {Y+16} L{cx(5)} {E2Y-2}",dash="2 3"))
g.append(t(E2X+10,E2Y+14,"Ví dụ 2 — tính số, viết insight, kiểm tra lỗi (diện tích lúa cả nước: 1995: 6,77 · 2013: 7,90 · 2024: 7,13 triệu ha)",10,"start",INK,600))
for k,(c,lab,txt,col) in enumerate(rows):
    y=E2Y+32+k*17
    g.append(swatch(E2X+10,y,c)); g.append(t(E2X+26,y,lab,10,"start",INK,600)); g.append(t(E2X+140,y,txt,10,"start",col))
ly=E2Y+E2H+22
g.append(swatch(20,ly,LLM)+t(36,ly,"LLM call",11,"start","#5F5E5A"))
g.append(swatch(120,ly,TOOL)+t(136,ly,"Gate / tool (chương trình)",11,"start","#5F5E5A"))
g.append(swatch(300,ly,PILL,True)+t(316,ly,"Vào / ra",11,"start","#5F5E5A"))
H=ly+16
open('hinh-1-vai-tro-llm.svg','w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 {H}" width="680" height="{H}"><rect width="680" height="{H}" fill="#FFFFFF"/>{"".join(g)}</svg>')
print(H)
