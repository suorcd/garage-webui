package utils

import (
	"bytes"
	"image"
	_ "image/gif"
	"image/jpeg"
	_ "image/png"

	"golang.org/x/image/draw"
)

func CreateThumbnailImage(buffer []byte, width uint, height uint) ([]byte, error) {
	img, _, err := image.Decode(bytes.NewReader(buffer))
	if err != nil {
		return nil, err
	}

	thumb := thumbnail(img, width, height)
	buf := new(bytes.Buffer)
	if err := jpeg.Encode(buf, thumb, nil); err != nil {
		return nil, err
	}

	return buf.Bytes(), nil
}

// thumbnail scales img down to fit inside width x height. It keeps the
// aspect ratio and never scales up. It keeps the sizing of the old
// nfnt/resize Thumbnail: shrink the width first when it exceeds the box,
// then shrink the height when it still exceeds the box.
func thumbnail(img image.Image, maxWidth, maxHeight uint) image.Image {
	origBounds := img.Bounds()
	origWidth := uint(origBounds.Dx())
	origHeight := uint(origBounds.Dy())
	newWidth, newHeight := origWidth, origHeight

	if maxWidth >= origWidth && maxHeight >= origHeight {
		return img
	}

	if origWidth > maxWidth {
		newHeight = origHeight * maxWidth / origWidth
		if newHeight < 1 {
			newHeight = 1
		}
		newWidth = maxWidth
	}

	if newHeight > maxHeight {
		newWidth = newWidth * maxHeight / newHeight
		if newWidth < 1 {
			newWidth = 1
		}
		newHeight = maxHeight
	}

	dst := image.NewRGBA(image.Rect(0, 0, int(newWidth), int(newHeight)))
	draw.NearestNeighbor.Scale(dst, dst.Bounds(), img, origBounds, draw.Over, nil)

	return dst
}
