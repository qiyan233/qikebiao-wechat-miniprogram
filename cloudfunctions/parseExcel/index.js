// 云函数入口文件
const cloud = require('wx-server-sdk')
const xlsx = require('node-xlsx')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 云函数入口函数
exports.main = async (event, context) => {
  const { fileID } = event
  
  try {
    // 下载文件
    const fileRes = await cloud.downloadFile({
      fileID: fileID
    })
    
    const buffer = fileRes.fileContent
    
    // 解析 Excel
    const sheets = xlsx.parse(buffer)
    const data = sheets[0].data // 获取第一个 sheet 的数据
    
    // 使用与 Web 版相同的解析逻辑
    const courses = parseExcelData(data)
    
    // 删除临时文件
    await cloud.deleteFile({
      fileList: [fileID]
    })
    
    return {
      success: true,
      courses: courses
    }
  } catch (err) {
    console.error('解析Excel失败:', err)
    return {
      success: false,
      error: err.message
    }
  }
}

/**
 * 解析 Excel 数据（与 Web 版逻辑一致）
 */
function parseExcelData(data) {
  let headerRowIdx = -1
  let dayColMap = {} // 映射星期到列索引

  // 1. 寻找表头（包含星期一的行）
  for (let i = 0; i < data.length; i++) {
    const row = data[i]
    if (!row) continue
    for (let j = 0; j < row.length; j++) {
      const cell = String(row[j] || '').trim()
      if (cell.includes('星期一')) {
        headerRowIdx = i
        // 映射每一列对应的星期
        for (let k = j; k < row.length; k++) {
          const val = String(row[k] || '').trim()
          if (val.includes('星期一')) dayColMap[1] = k
          if (val.includes('星期二')) dayColMap[2] = k
          if (val.includes('星期三')) dayColMap[3] = k
          if (val.includes('星期四')) dayColMap[4] = k
          if (val.includes('星期五')) dayColMap[5] = k
          if (val.includes('星期六')) dayColMap[6] = k
          if (val.includes('星期日') || val.includes('星期天')) dayColMap[7] = k
        }
        break
      }
    }
    if (headerRowIdx !== -1) break
  }

  if (headerRowIdx === -1) {
    console.log('未能识别表头，请确保表格中包含"星期一"等字样')
    return []
  }

  console.log('找到表头行:', headerRowIdx, '列映射:', dayColMap)

  let parsedCourses = []
  let courseIdCounter = 1
  
  // 预设颜色系
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9']
  let colorMap = {}

  // 2. 遍历表头以下的数据行
  for (let i = headerRowIdx + 1; i < data.length; i++) {
    const row = data[i]
    if (!row || row.length === 0) continue

    for (let day = 1; day <= 7; day++) {
      const colIdx = dayColMap[day]
      if (colIdx === undefined) continue

      const cellText = String(row[colIdx] || '').trim()
      if (!cellText) continue

      // 3. 按行分割单元格内容进行解析
      // 通常结构：
      // 课程名称
      // 教师
      // 1-16(周)[01-02节]
      // 教室地点
      const lines = cellText.split('\n').map(l => l.trim()).filter(l => l !== '')
      
      for (let l = 0; l < lines.length; l++) {
        const line = lines[l]
        // 正则匹配：如 "1-4(周)[01-02节]" 或 "11-16([周])[01-02-03-04节]"
        const timeMatch = line.match(/([\d\-,]+).*?\[([\d\-]+)节\]/)
        
        if (timeMatch) {
          // 往前推找课名和老师
          let name = lines[l - 2] || '未知课程'
          let teacher = lines[l - 1] || ''
          // 往后推找地点
          let location = lines[l + 1] || ''
          // 容错：如果下一行也是时间格式，说明没有地点
          if (location && location.match(/([\d\-,]+).*?\[([\d\-]+)节\]/)) {
            location = ''
          }

          // 解析周次
          let weeksStr = timeMatch[1]
          let weeks = []
          weeksStr.split(',').forEach(part => {
            if (part.includes('-')) {
              let [start, end] = part.split('-').map(Number)
              for (let w = start; w <= end; w++) weeks.push(w)
            } else {
              weeks.push(Number(part))
            }
          })
          
          // 解析节次
          let periodsStr = timeMatch[2]
          let periodNums = periodsStr.split('-').map(Number)
          let startPeriod = Math.min(...periodNums)
          let endPeriod = Math.max(...periodNums)
          
          // 相同课程分配相同颜色
          if (!colorMap[name]) {
            colorMap[name] = colors[Object.keys(colorMap).length % colors.length]
          }

          parsedCourses.push({
            id: 'c_' + courseIdCounter++,
            name: name,
            teacher: teacher,
            location: location,
            day: day,
            start: startPeriod,
            end: endPeriod,
            weeks: weeks,
            color: colorMap[name]
          })
        }
      }
    }
  }

  console.log('解析到课程数量:', parsedCourses.length)
  return parsedCourses
}
