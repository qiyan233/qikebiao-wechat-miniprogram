// components/course-detail/course-detail.js
Component({
  properties: {
    course: {
      type: Object,
      value: null
    },
    timeSlots: {
      type: Array,
      value: []
    }
  },

  data: {
    visible: false,
    weekDays: ['一', '二', '三', '四', '五', '六', '日'],
    formattedWeeks: ''
  },

  observers: {
    'course': function(course) {
      if (course) {
        this.setData({ visible: true })
        this.formatWeeks(course.weeks)
      }
    }
  },

  methods: {
    formatWeeks(weeks) {
      if (!weeks || weeks.length === 0) {
        this.setData({ formattedWeeks: '未知周次' })
        return
      }
      
      const sorted = [...weeks].sort((a, b) => a - b)
      const result = []
      let start = sorted[0]
      let end = sorted[0]
      
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] === end + 1) {
          end = sorted[i]
        } else {
          result.push(start === end ? `${start}` : `${start}-${end}`)
          start = sorted[i]
          end = sorted[i]
        }
      }
      result.push(start === end ? `${start}` : `${start}-${end}`)
      
      this.setData({ formattedWeeks: result.join(', ') + ' 周' })
    },

    onClose() {
      this.setData({ visible: false })
      this.triggerEvent('close')
    },

    onMaskTap() {
      this.onClose()
    },

    preventBubble() {}
  }
})
