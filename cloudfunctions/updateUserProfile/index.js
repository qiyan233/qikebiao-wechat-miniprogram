const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const db = cloud.database()
  const usersCollection = db.collection('users')

  const userInfo = event.userInfo || {}
  const normalizedUserInfo = {
    nickName: userInfo.nickName || '',
    avatarUrl: userInfo.avatarUrl || '',
    gender: userInfo.gender || 0,
    city: userInfo.city || '',
    province: userInfo.province || '',
    country: userInfo.country || '',
    language: userInfo.language || ''
  }

  const existing = await usersCollection.where({
    _openid: wxContext.OPENID
  }).get()

  if (existing.data.length > 0) {
    await usersCollection.doc(existing.data[0]._id).update({
      data: {
        userInfo: normalizedUserInfo,
        nickName: normalizedUserInfo.nickName,
        avatarUrl: normalizedUserInfo.avatarUrl,
        updateTime: db.serverDate()
      }
    })
  } else {
    await usersCollection.add({
      data: {
        _openid: wxContext.OPENID,
        userInfo: normalizedUserInfo,
        nickName: normalizedUserInfo.nickName,
        avatarUrl: normalizedUserInfo.avatarUrl,
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    })
  }

  return {
    success: true,
    openid: wxContext.OPENID,
    userInfo: normalizedUserInfo
  }
}
