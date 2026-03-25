Component({
  data: {
    selected: 0,
    list: [
      { pagePath: "/pages/schedule/schedule", text: "课表", icon: "📅" },
      { pagePath: "/pages/profile/profile", text: "我的", icon: "👤" }
    ]
  },
  methods: {
    switchTab(e) {
      const data = e.currentTarget.dataset
      const url = data.path
      wx.switchTab({ url })
    }
  }
})
