// pages/schedule/schedule.js
const app = getApp()

// 默认作息时间（与源码一致）
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

// 苹果风格渐变色类名
const COLOR_CLASSES = [
  'bg-apple-pink', 'bg-apple-blue', 'bg-apple-green', 'bg-apple-yellow', 
  'bg-apple-purple', 'bg-apple-orange', 'bg-apple-cyan'
]

Page({
  data: {
    // 用户信息
    userInfo: null,
    hasUserInfo: false,
    
    // 课表数据
    courses: [],
    
    // 课程位置映射
    coursesMap: {},
    
    // 课程列表（用于渲染）
    coursesList: [],
    
    // 设置
    semesterStartDate: '',
    timeSlots: DEFAULT_TIME_SLOTS,
    
    // 周次
    currentWeek: 1,
    totalWeeks: 25,
    weekDates: [],
    currentMonth: '',

    // 自定义导航安全区
    statusBarHeight: 20,
    navBarHeight: 88,
    navCapsuleRight: 24,
    
    // UI 状态
    loading: true,
    showCourseDetail: false,
    selectedCourse: null,
    showTimeSettings: false
  },

  onLoad() {
    this.initNavLayout()
    this.initData()
  },


  onShow() {
    if (this.data.hasUserInfo) {
      this.loadSchedule()
    }
  },

  onPullDownRefresh() {
    this.loadSchedule().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  initNavLayout() {
    try {
      const systemInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      const menuButton = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null
      const statusBarHeight = systemInfo.statusBarHeight || 20

      if (menuButton && menuButton.top) {
        const gap = menuButton.top - statusBarHeight
        const navBarHeight = statusBarHeight + menuButton.height + gap * 2
        const navCapsuleRight = Math.max(12, systemInfo.windowWidth - menuButton.right)
        this.setData({
          statusBarHeight,
          navBarHeight,
          navCapsuleRight
        })
        return
      }

      this.setData({
        statusBarHeight,
        navBarHeight: statusBarHeight + 44,
        navCapsuleRight: 12
      })
    } catch (error) {
      this.setData({
        statusBarHeight: 20,
        navBarHeight: 64,
        navCapsuleRight: 12
      })
    }
  },

  // 初始化数据
  async initData() {

    const userInfo = wx.getStorageSync('userInfo')
    if (userInfo) {
      this.setData({ userInfo, hasUserInfo: true })
      await this.loadSchedule()
    } else {
      this.setData({ loading: false })
    }
    this.calculateWeekDates()
  },

  // 获取用户信息
  getUserProfile() {
    wx.getUserProfile({
      desc: '用于完善课程表个人信息',
      success: async (res) => {
        const userInfo = res.userInfo
        this.setData({ userInfo, hasUserInfo: true })
        wx.setStorageSync('userInfo', userInfo)
        app.globalData.userInfo = userInfo
        app.globalData.hasUserInfo = true
        
        await wx.cloud.callFunction({
          name: 'login',
          data: { userInfo }
        })
        await wx.cloud.callFunction({
          name: 'updateUserProfile',
          data: { userInfo }
        })
        this.loadSchedule()
      }
    })
  },


  // 加载课表数据
  async loadSchedule() {
    this.setData({ loading: true })
    
    try {
      const res = await wx.cloud.callFunction({ name: 'getSchedule' })
      const data = res.result || {}
      
      let currentWeek = 1
      if (data.settings?.semesterStartDate) {
        currentWeek = this.calculateCurrentWeek(data.settings.semesterStartDate)
      }
      
      const courses = data.courses || []
      const timeSlots = data.settings?.timeSlots || DEFAULT_TIME_SLOTS
      const { map: coursesMap, list: coursesList } = this.buildCoursesMap(courses, currentWeek)
      
      this.setData({
        courses,
        coursesMap,
        coursesList,
        semesterStartDate: data.settings?.semesterStartDate || '',
        timeSlots,
        currentWeek,
        loading: false
      })

      
      this.calculateWeekDates()
    } catch (err) {
      console.error('加载课表失败', err)
      this.setData({ loading: false })
    }
  },

  // 构建课程位置映射
  buildCoursesMap(courses, currentWeek) {
    const map = {}
    const list = []
    if (!courses || !courses.length) return { map, list }
    
    // 过滤当前周的课程
    const weekCourses = courses.filter(course => {
      return course.weeks && course.weeks.includes(currentWeek)
    })
    
    // 颜色映射（同名课程同色）
    const colorMap = {}
    let colorIndex = 0
    
    weekCourses.forEach((c, index) => {
      if (!colorMap[c.name]) {
        colorMap[c.name] = COLOR_CLASSES[colorIndex % COLOR_CLASSES.length]
        colorIndex++
      }
    })
    
    // 记录已占用的格子
    const occupied = {}
    
    // 构建位置映射
    let delayIndex = 0
    weekCourses.forEach(c => {
      const day = c.day
      const start = c.start
      const end = c.end
      
      // 计算跨越的节数
      const span = end - start + 1
      
      // 主键：day_start
      const key = `${day}_${start}`
      
      // 检查起始格子是否已被占用
      if (occupied[key]) return
      
      // 标记所有被占用的格子
      for (let p = start; p <= end; p++) {
        occupied[`${day}_${p}`] = true
      }
      
      const courseData = {
        id: c.id || `${day}_${start}_${Date.now()}`,
        name: c.name,
        teacher: c.teacher || '',
        location: c.location || '',
        day: day,
        start: start,
        end: end,
        weeks: c.weeks,
        colorClass: colorMap[c.name],
        delay: delayIndex * 30,
        span: span  // 跨节数
      }
      
      map[key] = courseData
      list.push(courseData)
      delayIndex++
    })
    
    return { map, list }
  },

  // 计算当前周次
  calculateCurrentWeek(startDate) {
    const startObj = new Date(startDate)
    const nowObj = new Date()
    
    const startDayOfWeek = startObj.getDay() || 7
    const mondayOffset = startDayOfWeek - 1
    startObj.setDate(startObj.getDate() - mondayOffset)
    startObj.setHours(0, 0, 0, 0)
    
    const diffTime = Math.abs(nowObj - startObj)
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    const diffWeeks = Math.ceil(diffDays / 7)
    
    return Math.max(1, Math.min(25, diffWeeks))
  },

  // 计算每周日期
  calculateWeekDates() {
    const { currentWeek, semesterStartDate } = this.data
    const weekDates = []
    
    // 初始化空的日期数据
    const baseDays = [
      { weekday: '周一', day: '', monthText: '', fullDate: '', isToday: false },
      { weekday: '周二', day: '', monthText: '', fullDate: '', isToday: false },
      { weekday: '周三', day: '', monthText: '', fullDate: '', isToday: false },
      { weekday: '周四', day: '', monthText: '', fullDate: '', isToday: false },
      { weekday: '周五', day: '', monthText: '', fullDate: '', isToday: false },
      { weekday: '周六', day: '', monthText: '', fullDate: '', isToday: false },
      { weekday: '周日', day: '', monthText: '', fullDate: '', isToday: false }
    ]
    
    if (!semesterStartDate) {
      this.setData({ weekDates: baseDays, currentMonth: '' })
      return
    }

    
    // 对齐到第一周的周一
    const startObj = new Date(semesterStartDate)
    const startDayOfWeek = startObj.getDay() || 7
    const mondayOffset = startDayOfWeek - 1
    startObj.setDate(startObj.getDate() - mondayOffset)
    
    // 计算当前显示周的周一
    const targetMonday = new Date(startObj)
    targetMonday.setDate(targetMonday.getDate() + (currentWeek - 1) * 7)
    
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    let currentMonth = ''
    
    for (let i = 0; i < 7; i++) {
      const targetDay = new Date(targetMonday)
      targetDay.setDate(targetDay.getDate() + i)
      
      const m = targetDay.getMonth() + 1
      const d = targetDay.getDate()
      
      baseDays[i].day = d
      baseDays[i].monthText = `${m}月`
      baseDays[i].fullDate = `${m}/${d}`
      baseDays[i].isToday = this.isSameDay(targetDay, today)
      
      if (i === 0) currentMonth = m
    }

    
    this.setData({ weekDates: baseDays, currentMonth })
  },

  isSameDay(d1, d2) {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate()
  },

  // 周次切换
  prevWeek() {
    if (this.data.currentWeek > 1) {
      const newWeek = this.data.currentWeek - 1
      const { map: coursesMap, list: coursesList } = this.buildCoursesMap(this.data.courses, newWeek)
      this.setData({ currentWeek: newWeek, coursesMap, coursesList })
      this.calculateWeekDates()
    }
  },

  nextWeek() {
    if (this.data.currentWeek < this.data.totalWeeks) {
      const newWeek = this.data.currentWeek + 1
      const { map: coursesMap, list: coursesList } = this.buildCoursesMap(this.data.courses, newWeek)
      this.setData({ currentWeek: newWeek, coursesMap, coursesList })
      this.calculateWeekDates()
    }
  },

  // 点击课程
  onCourseTap(e) {
    const { day, period } = e.currentTarget.dataset
    const key = `${day}_${period}`
    const course = this.data.coursesMap[key]
    
    if (course) {
      this.setData({
        selectedCourse: course,
        showCourseDetail: true
      })
    }
  },
  
  // 点击课程卡片
  onCourseCardTap(e) {
    const course = e.currentTarget.dataset.course
    if (course) {
      this.setData({
        selectedCourse: course,
        showCourseDetail: true
      })
    }
  },

  onCloseDetail() {
    this.setData({ showCourseDetail: false, selectedCourse: null })
  },

  onCloseTimeSettings() {
    this.setData({ showTimeSettings: false })
  },

  async onSaveTimeSettings(e) {
    const { timeSlots } = e.detail
    this.setData({ timeSlots })
    
    try {
      await wx.cloud.callFunction({
        name: 'saveSettings',
        data: { timeSlots }
      })
      wx.showToast({ title: '保存成功', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: '保存失败', icon: 'error' })
    }
    
    this.onCloseTimeSettings()
  },

  // 导入 Excel
  async importExcel() {
    try {
      const res = await wx.chooseMessageFile({
        count: 1,
        type: 'file',
        extension: ['xlsx', 'xls']
      })
      
      const file = res.tempFiles[0]
      wx.showLoading({ title: '正在解析...' })
      
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath: `excel/${Date.now()}_${file.name}`,
        filePath: file.path
      })
      
      const parseRes = await wx.cloud.callFunction({
        name: 'parseExcel',
        data: { fileID: uploadRes.fileID }
      })
      
      wx.hideLoading()
      
      if (parseRes.result && parseRes.result.courses && parseRes.result.courses.length > 0) {
        await wx.cloud.callFunction({
          name: 'saveSchedule',
          data: {
            courses: parseRes.result.courses,
            timeSlots: this.data.timeSlots,
            reminderMinutes: 10,
            replaceExisting: true
          }
        })
        
        wx.showToast({ title: `导入${parseRes.result.courses.length}门课程`, icon: 'success' })
        this.loadSchedule()
      } else {

        wx.showToast({ title: '未能识别课程数据', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      console.error('导入失败', err)
      wx.showToast({ title: '导入失败', icon: 'error' })
    }
  },

  // Tab 切换
  onTabSchedule() {
    // 当前页
  },

  onTabProfile() {
    wx.switchTab({ url: '/pages/profile/profile' })
  },

  onShareAppMessage() {
    return {
      title: '我的课程表',
      path: '/pages/schedule/schedule'
    }
  }
})
