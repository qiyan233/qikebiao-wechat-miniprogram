/**
 * 小程序配置文件
 */

const host = 'example.com'

const config = {
  // 测试的请求地址，用于测试会话
  requestUrl: 'https://mp.weixin.qq.com',
  host,

  // 云开发环境 ID，请按需替换
  envId: 'your-cloud-env-id',

  // 云开发-存储 示例文件的文件 ID，请按需替换
  demoImageFileId: 'cloud://your-cloud-env-id.example-bucket/demo.jpg',
  demoVideoFileId: 'cloud://your-cloud-env-id.example-bucket/demo.mp4',
}

module.exports = config
