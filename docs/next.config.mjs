// 静的サイトとして書き出す（`next build` が out/ に HTML を作る）。どの静的ホスティングにも置ける。
// サブパスに置くときは、ビルド時に DOCS_BASE_PATH=/comatype を付ける（GitHub Pages のプロジェクトサイトなど）
const basePath = (process.env.DOCS_BASE_PATH ?? '').replace(/\/$/, '')

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true, // /guide/introduction/index.html として書き出す（どのホストでも、URL がそのまま開ける）
  basePath,
  images: { unoptimized: true },
  reactStrictMode: true,
  transpilePackages: ['monaco-editor'],
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
}

export default nextConfig
