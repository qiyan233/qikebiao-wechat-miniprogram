// app.js
App({
  onLaunch: function () {
    // 初始化云开发
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      wx.cloud.init({
        // 请替换为你自己的云开发环境 ID
        env: 'your-cloud-env-id',
        traceUser: true,
      })
    }

    // 检查登录状态
    this.checkLogin()
  },

  checkLogin() {
    const userInfo = wx.getStorageSync('userInfo')
    if (userInfo) {
      this.globalData.userInfo = userInfo
      this.globalData.hasUserInfo = true
    }
  },

  globalData: {
    userInfo: null,
    hasUserInfo: false
  }
})
