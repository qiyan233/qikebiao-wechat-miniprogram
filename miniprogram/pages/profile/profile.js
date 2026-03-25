// pages/profile/profile.js
const app = getApp()

const DEFAULT_TIME_SLOTS = [
  { id: 1, start: '08:00', end: '08:45' },
  { id: 2, start: '08:55', end: '09:40' },
  { id: 3, start: '10:05', end: '10:50' },
  { id: 4, start: '11:00', end: '11:45' },
  { id: 5, start: '14:30', end: '15:15' },
  { id: 6, start: '15:25', end: '16:10' },
  { id: 7, start: '16:35', end: '17:20' },
  { id: 8, start: '17:30', end: '18:15' },
  { id: 9, start: '19:30', end: '20:15' },
  { id: 10, start: '20:25', end: '21:10' },
  { id: 11, start: '21:20', end: '22:05' },
  { id: 12, start: '22:15', end: '23:00' }
]

const DEFAULT_SUBSCRIBE_TEMPLATE_DATA = {
  thing2: '请提前到教室',
  date4: '2026-03-25 08:00:00',
  thing10: '博学楼',
  thing27: '大学语文'
}

const DEFAULT_SUBSCRIBE_TEMPLATE_ID = 'kkUb5u_Q9Lkt3zW4Q3KS17RGKBSqpHHqVmvlTOYboRM'
const DEFAULT_SUBSCRIBE_PAGE = 'pages/schedule/schedule'
const DEFAULT_REMINDER_MINUTES = 10
const REMINDER_MINUTE_OPTIONS = [5, 10, 15, 20, 30, 45, 60]

Page({
  data: {
    userInfo: null,
    hasUserInfo: false,

    // 统计
    totalCourses: 0,
    totalHours: 0,

    // 设置
    semesterStartDate: '',
    subscribeMessageEnabled: false,
    subscribeTemplateId: DEFAULT_SUBSCRIBE_TEMPLATE_ID,
    subscribePage: DEFAULT_SUBSCRIBE_PAGE,
    subscribeDataText: JSON.stringify(DEFAULT_SUBSCRIBE_TEMPLATE_DATA, null, 2),
    timeSlots: DEFAULT_TIME_SLOTS,
    classReminderEnabled: false,
    reminderMinutes: DEFAULT_REMINDER_MINUTES,
    reminderMinuteOptions: REMINDER_MINUTE_OPTIONS,
    reminderMinuteIndex: REMINDER_MINUTE_OPTIONS.indexOf(DEFAULT_REMINDER_MINUTES),
    testScanDate: '',
    scanResultText: '',
    dayCourseList: [],
    selectedCourseId: '',

    // 控制器
    showDatePicker: false,
    showTimeSettings: false
  },

  onLoad() {
    this.loadUserInfo()
  },

  onShow() {
    this.loadUserInfo()
    if (this.data.hasUserInfo) {
      this.loadSettings()
    }
  },

  loadUserInfo() {
    const userInfo = wx.getStorageSync('userInfo')
    if (userInfo) {
      this.setData({ userInfo, hasUserInfo: true })
    }
  },

  updateLocalUserInfo(patch = {}) {
    const currentUserInfo = this.data.userInfo || {}
    const userInfo = {
      ...currentUserInfo,
      ...patch
    }

    this.setData({ userInfo, hasUserInfo: true })
    wx.setStorageSync('userInfo', userInfo)
    app.globalData.userInfo = userInfo
    app.globalData.hasUserInfo = true

    return userInfo
  },

  async syncUserProfileToCloud(userInfo) {
    try {
      await wx.cloud.callFunction({
        name: 'updateUserProfile',
        data: { userInfo }
      })
    } catch (error) {
      console.error('同步用户资料失败', error)
      wx.showToast({ title: '云端同步失败', icon: 'none' })
    }
  },

  async onChooseWechatAvatar(e) {
    const avatarUrl = e.detail.avatarUrl
    if (!avatarUrl) return

    const userInfo = this.updateLocalUserInfo({ avatarUrl })
    await this.syncUserProfileToCloud(userInfo)
    wx.showToast({ title: '已使用微信头像', icon: 'success' })
  },

  onChooseCustomAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const avatarUrl = res.tempFiles?.[0]?.tempFilePath
        if (!avatarUrl) return
        const userInfo = this.updateLocalUserInfo({ avatarUrl })
        await this.syncUserProfileToCloud(userInfo)
        wx.showToast({ title: '自定义头像已更新', icon: 'success' })
      }
    })
  },

  async onNicknameBlur(e) {
    const nickName = (e.detail.value || '').trim()
    if (!nickName) {
      wx.showToast({ title: '昵称不能为空', icon: 'none' })
      return
    }

    if (nickName === this.data.userInfo?.nickName) return

    const userInfo = this.updateLocalUserInfo({ nickName })
    await this.syncUserProfileToCloud(userInfo)
    wx.showToast({ title: '昵称已更新', icon: 'success' })
  },

  async loadSettings() {
    try {
      const res = await wx.cloud.callFunction({ name: 'getSettings' })
      const settings = res.result || {}

      const scheduleRes = await wx.cloud.callFunction({ name: 'getSchedule' })
      const courses = scheduleRes.result?.courses || []

      let totalHours = 0
      courses.forEach(c => {
        totalHours += (c.end - c.start + 1) * (c.weeks?.length || 0)
      })

      const savedReminderMinutes = Number(settings.reminderMinutes || DEFAULT_REMINDER_MINUTES)
      const reminderMinutes = REMINDER_MINUTE_OPTIONS.includes(savedReminderMinutes)
        ? savedReminderMinutes
        : DEFAULT_REMINDER_MINUTES

      this.setData({
        semesterStartDate: settings.semesterStartDate || '',
        subscribeMessageEnabled: settings.subscribeMessageEnabled !== undefined ? !!settings.subscribeMessageEnabled : true,
        subscribeTemplateId: settings.subscribeTemplateId || DEFAULT_SUBSCRIBE_TEMPLATE_ID,
        subscribePage: settings.subscribePage || DEFAULT_SUBSCRIBE_PAGE,
        subscribeDataText: JSON.stringify(settings.subscribeData || DEFAULT_SUBSCRIBE_TEMPLATE_DATA, null, 2),
        classReminderEnabled: !!settings.classReminderEnabled,
        reminderMinutes,
        reminderMinuteIndex: REMINDER_MINUTE_OPTIONS.indexOf(reminderMinutes),
        testScanDate: this.getTodayDateString(),
        dayCourseList: [],
        selectedCourseId: '',
        scanResultText: '',
        totalCourses: courses.length,
        totalHours
      })
    } catch (err) {
      console.error('加载设置失败', err)
    }
  },

  getUserProfile() {
    wx.getUserProfile({
      desc: '用于完善课程表个人信息',
      success: async (res) => {
        const userInfo = this.updateLocalUserInfo(res.userInfo)

        await wx.cloud.callFunction({
          name: 'login',
          data: { userInfo }
        })
        await this.syncUserProfileToCloud(userInfo)
      }
    })
  },

  onSetStartDate() {
    this.setData({ showDatePicker: true })
  },

  onDateChange(e) {
    const semesterStartDate = e.detail.value
    this.setData({ semesterStartDate, showDatePicker: false })
    this.saveSettings({ semesterStartDate })
  },

  onDateCancel() {
    this.setData({ showDatePicker: false })
  },


  async onReminderToggle(e) {
    const classReminderEnabled = !!e.detail.value
    this.setData({ classReminderEnabled })

    if (classReminderEnabled) {
      const accepted = await this.requestSubscribePermission()
      if (!accepted) {
        this.setData({ classReminderEnabled: false })
        return
      }
    }

    this.saveSettings({
      classReminderEnabled,
      subscribeMessageEnabled: true,
      subscribeTemplateId: DEFAULT_SUBSCRIBE_TEMPLATE_ID,
      subscribePage: DEFAULT_SUBSCRIBE_PAGE,
      subscribeData: DEFAULT_SUBSCRIBE_TEMPLATE_DATA,
      reminderMinutes: this.data.reminderMinutes,
      lastReminderId: ''
    })
  },

  onTestScanDateChange(e) {
    this.setData({
      testScanDate: e.detail.value,
      dayCourseList: [],
      selectedCourseId: '',
      scanResultText: ''
    })
  },

  onSelectDayCourse(e) {
    const courseId = e.currentTarget.dataset.id
    this.setData({
      selectedCourseId: courseId
    })
  },

  onReminderMinutesChange(e) {
    const reminderMinuteIndex = Number(e.detail.value)
    const reminderMinutes = this.data.reminderMinuteOptions[reminderMinuteIndex] || DEFAULT_REMINDER_MINUTES
    const dayCourseList = (this.data.dayCourseList || []).map(item => ({
      ...item,
      reminderMinutes,
      reminderTime: this.buildReminderDateTime(this.data.testScanDate || this.getTodayDateString(), item.startTime, reminderMinutes),
      reminderLabel: `课前 ${reminderMinutes} 分钟 · ${this.buildReminderDateTime(this.data.testScanDate || this.getTodayDateString(), item.startTime, reminderMinutes).slice(11, 16)}`
    }))

    this.setData({
      reminderMinutes,
      reminderMinuteIndex,
      dayCourseList
    })
    this.saveSettings({ reminderMinutes, lastReminderId: '' }, { silent: true })
  },

  getTodayDateString() {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  getWeekdayFromDate(dateText) {
    const date = new Date(dateText)
    const day = date.getDay()
    return day === 0 ? 7 : day
  },

  calculateCurrentWeek(startDate, targetDate) {
    const startObj = new Date(startDate)
    const startDayOfWeek = startObj.getDay() || 7
    startObj.setDate(startObj.getDate() - (startDayOfWeek - 1))
    startObj.setHours(0, 0, 0, 0)

    const current = new Date(targetDate)
    current.setHours(0, 0, 0, 0)

    const diffDays = Math.floor((current.getTime() - startObj.getTime()) / (1000 * 60 * 60 * 24))
    return Math.max(1, Math.floor(diffDays / 7) + 1)
  },

  buildDayCourseList(courses = [], dateText) {
    const semesterStartDate = this.data.semesterStartDate
    if (!semesterStartDate || !dateText) return []

    const currentWeek = this.calculateCurrentWeek(semesterStartDate, dateText)
    const currentDay = this.getWeekdayFromDate(dateText)
    const reminderMinutes = this.data.reminderMinutes || DEFAULT_REMINDER_MINUTES

    return courses
      .filter(course => course.day === currentDay && Array.isArray(course.weeks) && course.weeks.includes(currentWeek))
      .sort((a, b) => a.start - b.start)
      .map(course => {
        const slot = this.data.timeSlots[course.start - 1] || {}
        const startTime = slot.start || '08:00'
        const endTime = slot.end || ''
        const reminderTime = this.buildReminderDateTime(dateText, startTime, reminderMinutes)
        return {
          id: course.id || `${course.name}_${course.day}_${course.start}`,
          name: course.name,
          location: course.location || '未安排',
          startTime,
          endTime,
          classTime: `${dateText} ${startTime}:00`,
          reminderTime,
          reminderLabel: `课前 ${reminderMinutes} 分钟 · ${reminderTime.slice(11, 16)}`,
          weekText: `第${currentWeek}周`
        }
      })
  },

  buildReminderDateTime(dateText, startTime, reminderMinutes) {
    const reminderDate = new Date(`${dateText} ${startTime}:00`)
    reminderDate.setMinutes(reminderDate.getMinutes() - reminderMinutes)
    const year = reminderDate.getFullYear()
    const month = String(reminderDate.getMonth() + 1).padStart(2, '0')
    const day = String(reminderDate.getDate()).padStart(2, '0')
    const hours = String(reminderDate.getHours()).padStart(2, '0')
    const minutes = String(reminderDate.getMinutes()).padStart(2, '0')
    const seconds = String(reminderDate.getSeconds()).padStart(2, '0')
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
  },

  formatScanResult(dayCourseList = [], dateText = '') {
    if (!dayCourseList.length) {
      return `${dateText || '当天'}暂无课程`
    }

    const selectedCourse = dayCourseList.find(item => item.id === this.data.selectedCourseId)
    const lines = [
      `${dateText || '当天'}共找到 ${dayCourseList.length} 节课`
    ]

    if (selectedCourse) {
      lines.push(`当前已选：${selectedCourse.name}（${selectedCourse.startTime}）`)
    } else {
      lines.push('点下方课程卡片可指定测试发送某一节课')
    }

    return lines.join('\n')
  },

  parseSubscribeDataText() {
    const raw = (this.data.subscribeDataText || '').trim()
    if (!raw) {
      wx.showToast({ title: '请填写订阅消息数据', icon: 'none' })
      return null
    }

    try {
      const parsed = JSON.parse(raw)
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
        throw new Error('invalid subscribe data')
      }
      return parsed
    } catch (error) {
      console.error('解析订阅消息数据失败', error)
      wx.showToast({ title: '订阅消息数据需为 JSON 对象', icon: 'none' })
      return null
    }
  },

  async onRunReminderScan() {
    const testScanDate = this.data.testScanDate || this.getTodayDateString()

    try {
      wx.showLoading({ title: '扫描中...', mask: true })
      const scheduleRes = await wx.cloud.callFunction({ name: 'getSchedule' })
      const courses = scheduleRes.result?.courses || []
      const dayCourseList = this.buildDayCourseList(courses, testScanDate)
      const selectedCourseId = dayCourseList.some(item => item.id === this.data.selectedCourseId)
        ? this.data.selectedCourseId
        : ''

      this.setData({
        dayCourseList,
        selectedCourseId,
        scanResultText: this.formatScanResult(dayCourseList, testScanDate)
      })
    } catch (err) {
      console.error('测试扫描失败', err)
      this.setData({
        dayCourseList: [],
        selectedCourseId: '',
        scanResultText: `扫描失败：${err?.errMsg || '请稍后重试'}`
      })
    } finally {
      wx.hideLoading()
    }
  },

  async requestSubscribePermission() {
    const templateId = this.data.subscribeTemplateId.trim()
    if (!templateId) {
      wx.showToast({ title: '请先填写订阅模板 ID', icon: 'none' })
      return false
    }

    try {
      const res = await wx.requestSubscribeMessage({
        tmplIds: [templateId]
      })
      const accepted = res[templateId] === 'accept' || res.errMsg === 'requestSubscribeMessage:ok'
      if (!accepted) {
        wx.showToast({ title: '你没有允许订阅消息', icon: 'none' })
      }
      return accepted
    } catch (error) {
      console.error('请求订阅授权失败', error)
      wx.showToast({ title: (error?.errMsg || '订阅授权失败').slice(0, 30), icon: 'none' })
      return false
    }
  },

  async onTestReminder() {
    const subscribeTemplateId = this.data.subscribeTemplateId.trim()
    if (!subscribeTemplateId) {
      wx.showToast({ title: '请先填写订阅模板 ID', icon: 'none' })
      return
    }

    const subscribeData = this.parseSubscribeDataText()
    if (!subscribeData) return

    const accepted = await this.requestSubscribePermission()
    if (!accepted) return

    try {
      wx.showLoading({ title: '发送中...', mask: true })
      await this.saveSettings({
        subscribeMessageEnabled: this.data.subscribeMessageEnabled,
        subscribeTemplateId,
        subscribePage: (this.data.subscribePage || '').trim() || 'pages/schedule/schedule',
        subscribeData
      }, { silent: true })

      const selectedCourse = this.data.dayCourseList.find(item => item.id === this.data.selectedCourseId)
      const testScanDate = this.data.testScanDate || this.getTodayDateString()
      const fallbackCourse = selectedCourse || (this.data.dayCourseList || [])[0]
      const mockNow = fallbackCourse
        ? fallbackCourse.reminderTime
        : `${testScanDate} 08:00:00`

      const res = await wx.cloud.callFunction({
        name: 'openapi',
        data: selectedCourse ? {
          action: 'sendCourseReminderSubscribeMessage',
          templateId: subscribeTemplateId,
          page: (this.data.subscribePage || '').trim() || 'pages/schedule/schedule',
          reminderMinutes: this.data.reminderMinutes,
          courseName: selectedCourse.name,
          classTime: selectedCourse.classTime,
          location: selectedCourse.location,
          remark: `${selectedCourse.weekText} · 提前 ${this.data.reminderMinutes} 分钟提醒`
        } : {
          action: 'sendMatchedCourseReminder',
          templateId: subscribeTemplateId,
          page: (this.data.subscribePage || '').trim() || 'pages/schedule/schedule',
          reminderMinutes: this.data.reminderMinutes,
          mockNow
        }
      })

      wx.hideLoading()
      if (res.result?.success) {
        wx.showToast({ title: '测试订阅消息已发送', icon: 'success' })
        return
      }

      wx.showModal({
        title: '发送失败',
        content: res.result?.error || '发送失败',
        showCancel: false
      })
    } catch (err) {
      wx.hideLoading()
      console.error('测试课前订阅消息失败', err)
      wx.showModal({
        title: '发送失败',
        content: err?.errMsg || '发送失败',
        showCancel: false
      })
    }
  },

  async onTestSubscribeMessage() {
    const subscribeTemplateId = this.data.subscribeTemplateId.trim()
    if (!subscribeTemplateId) {
      wx.showToast({ title: '请先填写订阅模板 ID', icon: 'none' })
      return
    }

    const subscribeData = this.parseSubscribeDataText()
    if (!subscribeData) return

    const accepted = await this.requestSubscribePermission()
    if (!accepted) return

    wx.showLoading({ title: '发送中...', mask: true })
    try {
      await this.saveSettings({
        subscribeMessageEnabled: this.data.subscribeMessageEnabled,
        subscribeTemplateId,
        subscribePage: (this.data.subscribePage || '').trim() || 'pages/schedule/schedule',
        subscribeData
      }, { silent: true })

      const res = await wx.cloud.callFunction({
        name: 'openapi',
        data: {
          action: 'sendSubscribeMessage',
          templateId: subscribeTemplateId,
          page: (this.data.subscribePage || '').trim() || 'pages/schedule/schedule',
          data: subscribeData
        }
      })

      if (res.result?.success) {
        wx.showToast({ title: '订阅消息已发送', icon: 'success' })
        return
      }

      wx.showModal({
        title: '发送失败',
        content: res.result?.error || '发送失败',
        showCancel: false
      })
    } catch (err) {
      console.error('测试订阅消息失败', err)
      wx.showModal({
        title: '发送失败',
        content: err?.errMsg || '发送失败',
        showCancel: false
      })
    } finally {
      wx.hideLoading()
    }
  },

  async saveSettings(data, options = {}) {
    const { silent = false } = options

    try {
      await wx.cloud.callFunction({
        name: 'saveSettings',
        data
      })
      if (!silent) {
        wx.showToast({ title: '已保存', icon: 'success' })
      }
    } catch (err) {
      if (!silent) {
        wx.showToast({ title: '保存失败', icon: 'error' })
      }
    }
  },

  async importExcel() {
    try {
      const fileRes = await wx.chooseMessageFile({
        count: 1,
        type: 'file',
        extension: ['xls', 'xlsx']
      })

      const file = fileRes.tempFiles?.[0]
      if (!file) return

      wx.showLoading({ title: '导入中...', mask: true })

      const uploadRes = await wx.cloud.uploadFile({
        cloudPath: `schedule-import/${Date.now()}-${file.name}`,
        filePath: file.path
      })

      const parseRes = await wx.cloud.callFunction({
        name: 'parseExcel',
        data: { fileID: uploadRes.fileID }
      })

      const courses = parseRes.result?.courses || []
      await wx.cloud.callFunction({
        name: 'saveSchedule',
        data: {
          courses,
          timeSlots: this.data.timeSlots,
          reminderMinutes: this.data.reminderMinutes,
          replaceExisting: true
        }
      })

      wx.hideLoading()
      wx.showToast({ title: '导入成功', icon: 'success' })
      this.loadSettings()
    } catch (err) {
      wx.hideLoading()
      if (err && err.errMsg && err.errMsg.includes('cancel')) return
      wx.showToast({ title: '导入失败', icon: 'error' })
      console.error('导入课表失败', err)
    }
  },

  onOpenTimeSettings() {
    this.setData({ showTimeSettings: true })
  },

  onCloseTimeSettings() {
    this.setData({ showTimeSettings: false })
  },

  async onSaveTimeSettings(e) {
    const timeSlots = e.detail.timeSlots || []
    this.setData({ showTimeSettings: false })
    await this.saveSettings({ timeSlots })
  },

  async onClearSchedule() {
    const res = await wx.showModal({
      title: '确认清除',
      content: '确定要清除所有课程吗？此操作不可恢复'
    })

    if (res.confirm) {
      try {
        await wx.cloud.callFunction({ name: 'clearSchedule' })
        wx.showToast({ title: '已清除', icon: 'success' })
        this.setData({ totalCourses: 0, totalHours: 0 })
      } catch (err) {
        wx.showToast({ title: '操作失败', icon: 'error' })
      }
    }
  },

  onAbout() {
    wx.showModal({
      title: '关于课程表',
      content: '大学课程表小程序 v1.0\n\n基于云开发构建，支持 Excel 导入、周次切换、订阅消息提醒等功能。',
      showCancel: false
    })
  },

  onShareAppMessage() {
    return {
      title: '大学课程表 - 简洁高效的课表管理工具',
      path: '/pages/schedule/schedule'
    }
  }
})
