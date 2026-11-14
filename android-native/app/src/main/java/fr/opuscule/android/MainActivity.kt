package fr.opuscule.android

import android.Manifest
import android.os.Bundle
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.Box
import androidx.lifecycle.viewmodel.compose.viewModel
import fr.opuscule.android.ui.AuthScreen
import fr.opuscule.android.ui.OpusculeApp
import fr.opuscule.android.ui.OpusculeTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        DailyReminderScheduler.schedule(this)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 2049)
        setContent {
            val state: AppState = viewModel()
            OpusculeTheme(
                themeMode = state.themeMode,
                compactInterface = state.compactInterface,
                readingFontSize = state.readingFontSize,
            ) {
                Surface(Modifier.fillMaxSize()) {
                    Root(state)
                }
            }
        }
    }
}

@Composable
private fun Root(state: AppState) {
    when {
        state.restoring -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        state.user == null -> AuthScreen(state)
        else -> OpusculeApp(state)
    }
}
