package utils

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"testing"
)

// solidImage builds a test image of the given size filled with one color.
func solidImage(t *testing.T, width, height int) []byte {
	t.Helper()

	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.Set(x, y, color.RGBA{R: 200, G: 30, B: 40, A: 255})
		}
	}

	buf := new(bytes.Buffer)
	if err := png.Encode(buf, img); err != nil {
		t.Fatalf("encode test image: %v", err)
	}

	return buf.Bytes()
}

// decodeThumbnail decodes the thumbnail bytes and returns its size.
func decodeThumbnail(t *testing.T, thumb []byte) image.Config {
	t.Helper()

	config, format, err := image.DecodeConfig(bytes.NewReader(thumb))
	if err != nil {
		t.Fatalf("decode thumbnail: %v", err)
	}
	if format != "jpeg" {
		t.Fatalf("thumbnail format = %q, want jpeg", format)
	}

	return config
}

func TestCreateThumbnailImageLandscape(t *testing.T) {
	thumb, err := CreateThumbnailImage(solidImage(t, 200, 100), 64, 64)
	if err != nil {
		t.Fatalf("CreateThumbnailImage returned error: %v", err)
	}

	config := decodeThumbnail(t, thumb)
	if config.Width != 64 || config.Height != 32 {
		t.Fatalf("thumbnail size = %dx%d, want 64x32", config.Width, config.Height)
	}
}

func TestCreateThumbnailImagePortrait(t *testing.T) {
	thumb, err := CreateThumbnailImage(solidImage(t, 100, 200), 64, 64)
	if err != nil {
		t.Fatalf("CreateThumbnailImage returned error: %v", err)
	}

	config := decodeThumbnail(t, thumb)
	if config.Width != 32 || config.Height != 64 {
		t.Fatalf("thumbnail size = %dx%d, want 32x64", config.Width, config.Height)
	}
}

func TestCreateThumbnailImageTallNarrow(t *testing.T) {
	thumb, err := CreateThumbnailImage(solidImage(t, 40, 200), 64, 64)
	if err != nil {
		t.Fatalf("CreateThumbnailImage returned error: %v", err)
	}

	config := decodeThumbnail(t, thumb)
	if config.Width != 12 || config.Height != 64 {
		t.Fatalf("thumbnail size = %dx%d, want 12x64", config.Width, config.Height)
	}
}

func TestCreateThumbnailImageSmallImageUnchanged(t *testing.T) {
	thumb, err := CreateThumbnailImage(solidImage(t, 32, 32), 64, 64)
	if err != nil {
		t.Fatalf("CreateThumbnailImage returned error: %v", err)
	}

	config := decodeThumbnail(t, thumb)
	if config.Width != 32 || config.Height != 32 {
		t.Fatalf("thumbnail size = %dx%d, want 32x32", config.Width, config.Height)
	}
}

func TestCreateThumbnailImageInvalidInput(t *testing.T) {
	if _, err := CreateThumbnailImage([]byte("not an image"), 64, 64); err == nil {
		t.Fatal("CreateThumbnailImage returned no error for invalid input")
	}
}

func TestCreateThumbnailImageKeepsColor(t *testing.T) {
	thumb, err := CreateThumbnailImage(solidImage(t, 200, 200), 64, 64)
	if err != nil {
		t.Fatalf("CreateThumbnailImage returned error: %v", err)
	}

	img, err := jpeg.Decode(bytes.NewReader(thumb))
	if err != nil {
		t.Fatalf("decode thumbnail: %v", err)
	}

	r, g, b, _ := img.At(32, 32).RGBA()
	if !nearColor(r>>8, 200) || !nearColor(g>>8, 30) || !nearColor(b>>8, 40) {
		t.Fatalf("center pixel = (%d, %d, %d), want near (200, 30, 40)", r>>8, g>>8, b>>8)
	}
}

// nearColor reports whether a JPEG-decoded channel is close to the source.
// JPEG is lossy, so an exact match is not a fair assertion.
func nearColor(got, want uint32) bool {
	diff := int64(got) - int64(want)
	return diff >= -5 && diff <= 5
}
