package com.cristopherpineda.sularewards

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.cristopherpineda.sularewards.ui.App
import com.cristopherpineda.sularewards.ui.SulaTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            SulaTheme { App() }
        }
    }
}
