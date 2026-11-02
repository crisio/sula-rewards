package com.cristopherpineda.sularewards

import android.app.Application
import com.cristopherpineda.sularewards.core.BusinessStore
import com.cristopherpineda.sularewards.core.HiddenBusinesses
import com.cristopherpineda.sularewards.core.Nav
import com.cristopherpineda.sularewards.core.Session
import com.cristopherpineda.sularewards.core.Storage

class SulaApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Storage.init(this)
        Session.init()
        BusinessStore.init()
        HiddenBusinesses.init()
        Nav.init()
    }
}
