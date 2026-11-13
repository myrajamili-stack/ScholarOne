"""Validate uploaded photo content and store a metadata-free JPEG."""
from io import BytesIO
from PIL import Image, ImageOps, UnidentifiedImageError

MAX_PHOTO_BYTES = 5 * 1024 * 1024
MAX_PHOTO_PIXELS = 25_000_000

def prepare_photo(raw):
    if not raw:
        raise ValueError('Choose a photo to upload.')
    if len(raw) > MAX_PHOTO_BYTES:
        raise ValueError('Choose a photo smaller than 5 MB.')
    try:
        with Image.open(BytesIO(raw)) as original:
            if original.format not in ('JPEG', 'PNG', 'WEBP'):
                raise ValueError('Choose a JPG, PNG or WebP photo.')
            if original.width * original.height > MAX_PHOTO_PIXELS:
                raise ValueError('Choose a photo with at most 25 megapixels.')
            original.verify()
        with Image.open(BytesIO(raw)) as original:
            image = ImageOps.exif_transpose(original)
            image.thumbnail((1024, 1024))
            if image.mode in ('RGBA', 'LA', 'P'):
                rgba = image.convert('RGBA')
                image = Image.new('RGB', rgba.size, 'white')
                image.paste(rgba, mask=rgba.getchannel('A'))
            else:
                image = image.convert('RGB')
            output = BytesIO()
            image.save(output, format='JPEG', quality=90)
            return output.getvalue()
    except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError) as exc:
        raise ValueError('This photo could not be read. Choose a valid JPG, PNG or WebP image.') from exc
