package fr.opuscule.android

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import fr.opuscule.android.data.ApiClient
import fr.opuscule.android.data.SecureTokenStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.util.Calendar
import java.time.LocalTime

private const val REMINDER_ACTION = "fr.opuscule.android.DAILY_REMINDER"
private const val DAY_CHANGE_ACTION = "fr.opuscule.android.DAY_CHANGE"
private const val REMINDER_CHANNEL = "daily-agenda-reminders"
private const val REMINDER_ID = 2048

object DailyReminderScheduler {
    fun schedule(context: Context) {
        createChannel(context)
        val alarm = context.getSystemService(AlarmManager::class.java) ?: return
        val intent = Intent(context, DailyReminderReceiver::class.java).setAction(REMINDER_ACTION)
        val pending = PendingIntent.getBroadcast(
            context,
            REMINDER_ID,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val next = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 20)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
            if (timeInMillis <= System.currentTimeMillis()) add(Calendar.DAY_OF_YEAR, 1)
        }
        alarm.setInexactRepeating(
            AlarmManager.RTC_WAKEUP,
            next.timeInMillis,
            AlarmManager.INTERVAL_DAY,
            pending,
        )
        scheduleNextActivity(context)
    }

    private fun scheduleNextActivity(context: Context) {
        CoroutineScope(Dispatchers.IO).launch {
            val template = SecureTokenStore(context).load()?.let { runCatching { ApiClient().todayDayTemplate(it) }.getOrNull() } ?: return@launch
            val now = LocalTime.now().toSecondOfDay() / 60
            var elapsed = 0
            val next = template.segments.firstOrNull { segment -> elapsed += segment.minutes; elapsed > now } ?: template.segments.firstOrNull() ?: return@launch
            val minutesUntil = if (elapsed > now) elapsed - now else 1440 - now
            val alarm = context.getSystemService(AlarmManager::class.java) ?: return@launch
            val intent = Intent(context, DailyReminderReceiver::class.java).setAction(DAY_CHANGE_ACTION).putExtra("activity", next.name).putExtra("template", template.title)
            val pending = PendingIntent.getBroadcast(context, 2049, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            alarm.set(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + minutesUntil * 60_000L, pending)
        }
    }

    private fun createChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                REMINDER_CHANNEL,
                "Agenda et habitudes",
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply { description = "Rappels quotidiens des tâches et habitudes" }
            context.getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
        }
    }
}

class DailyReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != REMINDER_ACTION && intent?.action != DAY_CHANGE_ACTION && intent?.action != Intent.ACTION_BOOT_COMPLETED) return
        DailyReminderScheduler.schedule(context)
        if (intent?.action == DAY_CHANGE_ACTION) {
            createDayChangeNotification(context, intent.getStringExtra("activity").orEmpty(), intent.getStringExtra("template").orEmpty())
            return
        }
        val pendingResult = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val token = SecureTokenStore(context).load() ?: return@launch
                val summary = ApiClient().dailyReminderSummary(token)
                if (summary.openTodoCount == 0 && summary.missingHabitCount == 0) return@launch
                val parts = buildList {
                    if (summary.openTodoCount > 0) add("${summary.openTodoCount} tâche(s) à traiter")
                    if (summary.missingHabitCount > 0) add("${summary.missingHabitCount} habitude(s) non cochée(s)")
                }
                val notification = NotificationCompat.Builder(context, REMINDER_CHANNEL)
                    .setSmallIcon(android.R.drawable.ic_popup_reminder)
                    .setContentTitle("Votre agenda Opuscule")
                    .setContentText(parts.joinToString(" · "))
                    .setStyle(NotificationCompat.BigTextStyle().bigText(parts.joinToString("\n")))
                    .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                    .setAutoCancel(true)
                    .build()
                NotificationManagerCompat.from(context).notify(REMINDER_ID, notification)
            } finally {
                pendingResult.finish()
            }
        }
    }

    private fun createDayChangeNotification(context: Context, activity: String, template: String) {
        val notification = NotificationCompat.Builder(context, REMINDER_CHANNEL)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle("Changement d’activité")
            .setContentText("Journée « $template » · $activity")
            .setPriority(NotificationCompat.PRIORITY_DEFAULT).setAutoCancel(true).build()
        NotificationManagerCompat.from(context).notify(2049, notification)
    }
}
