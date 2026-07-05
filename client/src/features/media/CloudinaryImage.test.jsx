import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import CloudinaryImage from './CloudinaryImage';

describe('CloudinaryImage', () => {
  it('renders an img element with src and alt', () => {
    const { container } = render(
      <CloudinaryImage src="https://example.com/image.png" alt="test image" />
    );
    const img = container.querySelector('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/image.png');
    expect(img).toHaveAttribute('alt', 'test image');
  });

  it('sets width and height to prevent CLS', () => {
    const { container } = render(
      <CloudinaryImage src="https://example.com/image.png" alt="test" width={160} height={160} />
    );
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('width', '160');
    expect(img).toHaveAttribute('height', '160');
  });

  it('generates srcset for Cloudinary URLs with width buckets', () => {
    const cloudinaryUrl = 'https://res.cloudinary.com/demo/image/upload/v1/tsw/logo.png';
    const { container } = render(
      <CloudinaryImage src={cloudinaryUrl} alt="test" srcSetWidths={[80, 160]} />
    );
    const img = container.querySelector('img');
    const srcset = img.getAttribute('srcset');

    expect(srcset).toContain('w_80,c_limit');
    expect(srcset).toContain('w_160,c_limit');
    expect(srcset).toContain('80w');
    expect(srcset).toContain('160w');
  });

  it('does not generate srcset for non-Cloudinary URLs', () => {
    const { container } = render(
      <CloudinaryImage src="https://example.com/image.png" alt="test" srcSetWidths={[80, 160]} />
    );
    const img = container.querySelector('img');
    expect(img).not.toHaveAttribute('srcset');
  });

  it('sets loading=lazy by default', () => {
    const { container } = render(
      <CloudinaryImage src="https://example.com/image.png" alt="test" />
    );
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('allows eager loading override', () => {
    const { container } = render(
      <CloudinaryImage src="https://example.com/image.png" alt="test" loading="eager" />
    );
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('loading', 'eager');
  });

  it('sets decoding=async by default', () => {
    const { container } = render(
      <CloudinaryImage src="https://example.com/image.png" alt="test" />
    );
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('decoding', 'async');
  });

  it('accepts and applies className and style', () => {
    const { container } = render(
      <CloudinaryImage
        src="https://example.com/image.png"
        alt="test"
        className="rounded-full"
        style={{ border: '1px solid red' }}
      />
    );
    const img = container.querySelector('img');
    expect(img).toHaveClass('rounded-full');
    expect(img).toHaveStyle({ border: '1px solid red' });
  });

  it('sets sizes attribute when provided', () => {
    const { container } = render(
      <CloudinaryImage
        src="https://example.com/image.png"
        alt="test"
        sizes="(max-width: 640px) 100vw, 50vw"
      />
    );
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('sizes', '(max-width: 640px) 100vw, 50vw');
  });

  it('forwards ref', () => {
    const ref = { current: null };
    render(<CloudinaryImage ref={ref} src="https://example.com/image.png" alt="test" />);
    expect(ref.current).toBeInstanceOf(HTMLImageElement);
  });

  it('handles srcSet generation with f_auto,q_auto', () => {
    const cloudinaryUrl = 'https://res.cloudinary.com/demo/image/upload/v1/tsw/logo.png';
    const { container } = render(
      <CloudinaryImage src={cloudinaryUrl} alt="test" srcSetWidths={[80]} />
    );
    const img = container.querySelector('img');
    const srcset = img.getAttribute('srcset');

    expect(srcset).toContain('f_auto,q_auto');
  });
});
