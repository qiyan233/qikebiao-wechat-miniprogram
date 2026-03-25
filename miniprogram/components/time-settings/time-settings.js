// components/time-settings/time-settings.js
Component({
  properties: {
    timeSlots: {
      type: Array,
      value: []
    }
  },

  data: {
    slots: []
  },

  lifetimes: {
    attached() {
      this.setData({
        slots: JSON.parse(JSON.stringify(this.data.timeSlots))
      })
    }
  },

  methods: {
    onClose() {
      this.triggerEvent('close')
    },

    onTimeChange(e) {
      const { index, type } = e.currentTarget.dataset
      const value = e.detail.value
      const slots = this.data.slots
      slots[index][type] = value
      this.setData({ slots })
    },

    onSave() {
      this.triggerEvent('save', { timeSlots: this.data.slots })
    }
  }
})
