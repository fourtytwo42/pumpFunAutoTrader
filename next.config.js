/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['gateway.pinata.cloud', 'cf-ipfs.com', 'ipfs.io'],
  },
}

module.exports = nextConfig

