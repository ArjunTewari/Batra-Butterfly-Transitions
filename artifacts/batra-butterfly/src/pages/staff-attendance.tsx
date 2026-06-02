import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAttendance,
  getGetAttendanceQueryKey,
  useFaceScanAttendance,
  useMarkAttendance,
  type AttendanceStatusEntry,
} from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  Camera,
  ScanFace,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  UserCheck,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { loadFaceModels, computeDescriptor } from "@/lib/face";

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function StatusPill({ status }: { status: string | null }) {
  const map: Record<string, string> = {
    present: "bg-green-500/20 text-green-300 border-green-500/30",
    half_day: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    absent: "bg-red-500/20 text-red-300 border-red-500/30",
  };
  const label = status
    ? status === "half_day"
      ? "Half Day"
      : status.charAt(0).toUpperCase() + status.slice(1)
    : "Not Marked";
  return (
    <span
      className={`text-xs px-2.5 py-1 rounded-full border font-medium ${
        status ? map[status] ?? map.absent : "bg-white/5 text-gray-400 border-white/10"
      }`}
    >
      {label}
    </span>
  );
}

export default function StaffAttendance() {
  const [date, setDate] = useState(todayISO());
  const [cameraOn, setCameraOn] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const isToday = date === todayISO();

  const { data: attendance, isLoading } = useGetAttendance(
    { date },
    { query: { queryKey: getGetAttendanceQueryKey({ date }) } },
  );

  const faceScan = useFaceScanAttendance();
  const markAttendance = useMarkAttendance();

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const startCamera = async () => {
    try {
      loadFaceModels().then(() => setModelsReady(true));
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
      });
      streamRef.current = stream;
      setCameraOn(true);
      // wait for the video element to mount
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 50);
    } catch {
      toast({
        variant: "destructive",
        title: "Camera unavailable",
        description: "Allow camera access to scan faces.",
      });
    }
  };

  const invalidateAttendance = () =>
    queryClient.invalidateQueries({ queryKey: getGetAttendanceQueryKey({ date }) });

  const handleScan = async () => {
    if (!videoRef.current) return;
    setScanning(true);
    try {
      const { descriptor, detected } = await computeDescriptor(videoRef.current);
      if (!detected) {
        toast({
          variant: "destructive",
          title: "No face detected",
          description: "Center your face in the frame and try again.",
        });
        return;
      }
      faceScan.mutate(
        { data: { descriptor } },
        {
          onSuccess: (res) => {
            if (!res.matched) {
              toast({
                variant: "destructive",
                title: "Face not recognized",
                description: "No enrolled staff matched. Enroll the face from the staff profile.",
              });
              return;
            }
            if (res.alreadyMarked) {
              toast({
                title: `${res.staffName} already marked`,
                description: "Attendance for today was already recorded.",
              });
            } else {
              toast({
                title: `Welcome, ${res.staffName}`,
                description: "Marked present via face scan.",
              });
            }
            invalidateAttendance();
          },
          onError: (err) => {
            toast({
              variant: "destructive",
              title: "Scan failed",
              description: (err as Error)?.message || "Could not record attendance.",
            });
          },
        },
      );
    } finally {
      setScanning(false);
    }
  };

  const handleManualMark = (
    staffId: number,
    status: "present" | "half_day" | "absent",
  ) => {
    markAttendance.mutate(
      { data: { staffId, date, status } },
      {
        onSuccess: () => invalidateAttendance(),
        onError: (err) =>
          toast({
            variant: "destructive",
            title: "Failed to mark",
            description: (err as Error)?.message || "Could not update attendance.",
          }),
      },
    );
  };

  const entries: AttendanceStatusEntry[] = attendance ?? [];
  const presentCount = entries.filter((e) => e.status === "present").length;
  const halfCount = entries.filter((e) => e.status === "half_day").length;
  const markedCount = entries.filter((e) => e.status).length;

  return (
    <div className="space-y-6 max-w-[1100px] mx-auto">
      <div>
        <Link
          href="/staff"
          className="inline-flex items-center text-sm text-gray-400 hover:text-white mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Staff
        </Link>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Daily Attendance</h1>
            <p className="text-gray-400 mt-1">
              Scan staff faces to mark attendance, or set it manually
            </p>
          </div>
          <div className="flex items-end gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-400">Date</Label>
              <Input
                type="date"
                value={date}
                max={todayISO()}
                onChange={(e) => setDate(e.target.value || todayISO())}
                className="bg-white/5 border-white/10 text-white w-44"
                data-testid="input-attendance-date"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Face scan */}
        <Card className="bg-black border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScanFace className="h-5 w-5" /> Face Check-In
            </CardTitle>
            <CardDescription className="text-gray-400">
              {isToday
                ? "Recognizes enrolled staff and marks them present"
                : "Face check-in only available for today"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative aspect-video w-full rounded-lg overflow-hidden bg-white/[0.03] border border-white/10 flex items-center justify-center">
              {cameraOn ? (
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full h-full object-cover -scale-x-100"
                />
              ) : (
                <div className="flex flex-col items-center text-gray-600">
                  <Camera className="h-10 w-10 mb-2 text-white/10" />
                  <p className="text-sm">Camera is off</p>
                </div>
              )}
              {scanning && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-white" />
                </div>
              )}
            </div>

            {!cameraOn ? (
              <Button
                onClick={startCamera}
                disabled={!isToday}
                className="w-full bg-white text-black hover:bg-gray-200"
                data-testid="button-start-camera"
              >
                <Camera className="mr-2 h-4 w-4" /> Start Camera
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  onClick={handleScan}
                  disabled={scanning || faceScan.isPending || !modelsReady}
                  className="flex-1 bg-white text-black hover:bg-gray-200"
                  data-testid="button-scan-face"
                >
                  {!modelsReady ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…</>
                  ) : scanning || faceScan.isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scanning…</>
                  ) : (
                    <><ScanFace className="mr-2 h-4 w-4" /> Scan Face</>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={stopCamera}
                  className="border-white/10 text-white hover:bg-white/5"
                >
                  Stop
                </Button>
              </div>
            )}
            <p className="text-xs text-gray-600 text-center">
              Faces are matched against enrolled staff profiles on the server.
            </p>
          </CardContent>
        </Card>

        {/* Summary */}
        <Card className="bg-black border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5" /> Today's Summary
            </CardTitle>
            <CardDescription className="text-gray-400">
              {new Date(date + "T00:00:00").toLocaleDateString("en-IN", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-white/10 p-4 text-center">
                <p className="text-2xl font-bold text-green-400">{presentCount}</p>
                <p className="text-xs text-gray-500 mt-1">Present</p>
              </div>
              <div className="rounded-lg border border-white/10 p-4 text-center">
                <p className="text-2xl font-bold text-yellow-400">{halfCount}</p>
                <p className="text-xs text-gray-500 mt-1">Half Day</p>
              </div>
              <div className="rounded-lg border border-white/10 p-4 text-center">
                <p className="text-2xl font-bold text-white">
                  {markedCount}/{entries.length}
                </p>
                <p className="text-xs text-gray-500 mt-1">Marked</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Roster */}
      <Card className="bg-black border-white/10">
        <CardHeader>
          <CardTitle className="text-base">Staff Roster</CardTitle>
          <CardDescription className="text-gray-400">
            Set or override attendance manually
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-gray-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-10 text-gray-500 border border-dashed border-white/10 rounded-lg">
              No staff members yet. Add staff to track attendance.
            </div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence>
                {entries.map((e) => (
                  <motion.div
                    key={e.staffId}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border border-white/10 bg-white/[0.02]"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-full bg-white/5 flex items-center justify-center text-sm font-semibold text-white shrink-0">
                        {e.staffName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <Link href={`/staff/${e.staffId}`}>
                          <p className="text-sm font-medium text-white truncate hover:underline">
                            {e.staffName}
                          </p>
                        </Link>
                        <div className="flex items-center gap-2 mt-0.5">
                          {!e.enrolled && (
                            <span className="text-[10px] text-gray-500">No face enrolled</span>
                          )}
                          {e.checkInTime && (
                            <span className="text-[10px] text-gray-500 flex items-center gap-0.5">
                              <Clock className="h-2.5 w-2.5" />
                              {new Date(e.checkInTime).toLocaleTimeString("en-IN", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                              {e.method === "face" ? " · face" : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusPill status={e.status} />
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-green-400 hover:bg-green-500/10"
                          onClick={() => handleManualMark(e.staffId, "present")}
                          disabled={markAttendance.isPending}
                          data-testid={`button-present-${e.staffId}`}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-yellow-400 hover:bg-yellow-500/10"
                          onClick={() => handleManualMark(e.staffId, "half_day")}
                          disabled={markAttendance.isPending}
                          data-testid={`button-half-${e.staffId}`}
                        >
                          ½
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-red-400 hover:bg-red-500/10"
                          onClick={() => handleManualMark(e.staffId, "absent")}
                          disabled={markAttendance.isPending}
                          data-testid={`button-absent-${e.staffId}`}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
