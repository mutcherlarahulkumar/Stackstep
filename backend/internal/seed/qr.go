package seed

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
)

// SampleQR draws a QR-like placeholder image (not scannable) for test fixtures.
func SampleQR() []byte {
	const n, px = 25, 8
	img := image.NewGray(image.Rect(0, 0, n*px, n*px))
	for y := range n {
		for x := range n {
			finder := (x < 7 && y < 7) || (x >= n-7 && y < 7) || (x < 7 && y >= n-7)
			on := (x*7+y*13+x*y)%3 == 0
			if finder {
				dx, dy := x%(n-7), y%(n-7)
				if x >= n-7 {
					dx = x - (n - 7)
				}
				if y >= n-7 {
					dy = y - (n - 7)
				}
				on = dx == 0 || dy == 0 || dx == 6 || dy == 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4)
			}
			c := color.Gray{Y: 255}
			if on {
				c = color.Gray{Y: 20}
			}
			for i := range px {
				for j := range px {
					img.SetGray(x*px+i, y*px+j, c)
				}
			}
		}
	}
	var b bytes.Buffer
	_ = png.Encode(&b, img)
	return b.Bytes()
}
