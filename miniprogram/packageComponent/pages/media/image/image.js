
Page({
  onShareAppMessage() {
    return {
      title: 'image',
      path: 'packageComponent/pages/media/image/image'
    }
  },
  onLoad() {
    this.setData({
      theme: wx.getSystemInfoSync().theme || 'light'
    })

    if (wx.onThemeChange) {
      wx.onThemeChange(({theme}) => {
        this.setData({theme})
      })
    }
    wx.cloud.getTempFileURL({
      fileList: [{
        fileID: 'cloud://your-cloud-env-id.example-bucket/sample-image.webp',
        maxAge: 60 * 60,
      }]

    }).then(res => {
      console.log(res)
      this.setData({
        webpImageUrl: res.fileList[0].tempFileURL
      })
      return res
    }).catch(error => {
      console.log('CLOUD：image 临时链接获取失败', error)
    })
  },
  data: {
    theme: 'light',
    imageUrl: 'cloud://your-cloud-env-id.example-bucket/demo.jpg',
    webpImageURL: '',
  }
})
