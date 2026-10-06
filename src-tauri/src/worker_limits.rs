//! AntiRL process containment and resource limits for replay parsing workers.

#[cfg(windows)]
pub struct WorkerJob(windows_sys::Win32::Foundation::HANDLE);

#[cfg(windows)]
unsafe impl Send for WorkerJob {}

#[cfg(windows)]
impl WorkerJob {
    /// std::process does not expose the primary thread handle. Enumerate the
    /// suspended child's thread and resume it only after successful assignment.
    pub fn resume(pid: u32) -> Result<(), String> {
        use windows_sys::Win32::{
            Foundation::{CloseHandle, INVALID_HANDLE_VALUE},
            System::{Diagnostics::ToolHelp::*, Threading::*},
        };
        unsafe {
            let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0);
            if snapshot == INVALID_HANDLE_VALUE {
                return Err("Could not locate suspended parser thread".into());
            }
            let mut entry: THREADENTRY32 = std::mem::zeroed();
            entry.dwSize = std::mem::size_of::<THREADENTRY32>() as u32;
            let mut found = Thread32First(snapshot, &mut entry);
            while found != 0 {
                if entry.th32OwnerProcessID == pid {
                    let thread = OpenThread(THREAD_SUSPEND_RESUME, 0, entry.th32ThreadID);
                    if thread.is_null() {
                        CloseHandle(snapshot);
                        return Err("Could not open suspended parser thread".into());
                    }
                    let count = ResumeThread(thread);
                    CloseHandle(thread);
                    CloseHandle(snapshot);
                    return if count == 1 {
                        Ok(())
                    } else {
                        Err("Could not resume isolated parser thread".into())
                    };
                }
                found = Thread32Next(snapshot, &mut entry);
            }
            CloseHandle(snapshot);
            Err("Suspended parser thread was not found".into())
        }
    }

    pub fn attach(pid: u32) -> Result<Self, String> {
        use windows_sys::Win32::{
            Foundation::CloseHandle,
            System::{JobObjects::*, Threading::*},
        };
        unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() {
                return Err("Could not create parser resource boundary".into());
            }
            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
                | JOB_OBJECT_LIMIT_ACTIVE_PROCESS
                | JOB_OBJECT_LIMIT_PROCESS_MEMORY;
            limits.BasicLimitInformation.ActiveProcessLimit = 1;
            limits.ProcessMemoryLimit = 512 * 1024 * 1024;
            if SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &limits as *const _ as *const _,
                std::mem::size_of_val(&limits) as u32,
            ) == 0
            {
                CloseHandle(job);
                return Err("Could not limit parser resources".into());
            }
            let process = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, false as i32, pid);
            if process.is_null() {
                CloseHandle(job);
                return Err("Could not isolate parser process".into());
            }
            let assigned = AssignProcessToJobObject(job, process);
            CloseHandle(process);
            if assigned == 0 {
                CloseHandle(job);
                return Err("Could not assign parser resource boundary".into());
            }
            Ok(Self(job))
        }
    }
}

#[cfg(windows)]
impl Drop for WorkerJob {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.0);
        }
    }
}

#[cfg(not(windows))]
pub struct WorkerJob;

#[cfg(not(windows))]
impl WorkerJob {
    pub fn attach(_: u32) -> Result<Self, String> {
        Ok(Self)
    }
    pub fn resume(_: u32) -> Result<(), String> {
        Ok(())
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::{
        os::windows::process::CommandExt,
        time::{Duration, Instant},
    };

    #[test]
    fn suspended_child_runs_only_after_job_assignment_and_resume() {
        let dir = tempfile::tempdir().unwrap();
        let marker = dir.path().join("worker-started.txt");
        let mut child = std::process::Command::new("powershell.exe")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "[System.IO.File]::WriteAllText($env:ANTIRL_WORKER_TEST_MARKER, 'started')",
            ])
            .env("ANTIRL_WORKER_TEST_MARKER", &marker)
            .creation_flags(0x08000000 | 0x00000004)
            .spawn()
            .unwrap();
        let job = WorkerJob::attach(child.id()).unwrap();
        assert!(!marker.exists());
        assert!(child.try_wait().unwrap().is_none());
        WorkerJob::resume(child.id()).unwrap();
        let start = Instant::now();
        let status = loop {
            if let Some(status) = child.try_wait().unwrap() {
                break status;
            }
            if start.elapsed() > Duration::from_secs(15) {
                let _ = child.kill();
                panic!("Resumed child did not exit within the test deadline");
            }
            std::thread::sleep(Duration::from_millis(25));
        };
        assert!(status.success());
        assert_eq!(std::fs::read_to_string(marker).unwrap(), "started");
        drop(job);
    }
}
