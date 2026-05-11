"use client";

import { useState, useEffect, Dispatch, SetStateAction } from "react";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth, calendarProvider } from "../firebase";

type GoogleCalendarEvent = {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  colorId?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  recurrence?: string[];
  attendees?: { email: string; responseStatus?: string }[];
  conferenceData?: { createRequest?: { requestId: string } };
  reminders?: { useDefault: boolean; overrides?: { method: string; minutes: number }[] };
  allDay?: boolean;
};

type TrashItem = {
  id: number;
  section: "캘린더" | "플래너" | "프로젝트 센터" | "기록 센터";
  title: string;
  deletedAt: string;
  restore: () => void;
};

function CalendarPage({
  events,
  setEvents,
  onTrashItem,
}: {
  events: GoogleCalendarEvent[];
  setEvents: Dispatch<SetStateAction<GoogleCalendarEvent[]>>;
  onTrashItem: (item: Omit<TrashItem, "id" | "deletedAt">) => void;
}) {
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [isConnected, setIsConnected] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [calendarError, setCalendarError] = useState("");
  const [isCalendarLoading, setIsCalendarLoading] = useState(false);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventTitle, setEventTitle] = useState("");
  const [draggedEventId, setDraggedEventId] = useState<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);  
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [createStartY, setCreateStartY] = useState(0);
  const [createDate, setCreateDate] = useState<Date | null>(null);
  const [createPreview, setCreatePreview] = useState<{top: number, height: number} | null>(null);
  const [eventStart, setEventStart] = useState("");
  const [eventEnd, setEventEnd] = useState("");

  const startHour = 6;
  const endHour = 23;
  const hourHeight = 64;

  const startOfWeek = new Date(calendarDate);
  const day = calendarDate.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  startOfWeek.setDate(calendarDate.getDate() + diff);

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(startOfWeek);
    date.setDate(startOfWeek.getDate() + i);
    return date;
  });
  const getTimeFromY = (y: number, containerTop: number) => {
  const relativeY = y - containerTop;
  const totalMinutes = (relativeY / hourHeight) * 60 + startHour * 60;
  const snappedMinutes = Math.round(totalMinutes / 15) * 15;
  const hours = Math.floor(snappedMinutes / 60);
  const minutes = snappedMinutes % 60;
  return { hours: Math.max(startHour, Math.min(endHour - 1, hours)), minutes };
};
  const handleEventDragStart = (eventId: string) => {
  setDraggedEventId(eventId);
};

const handleEventDrop = async (targetDate: Date) => {
  if (!draggedEventId) return;
  const draggedEvent = events.find((e) => e.id === draggedEventId);
  if (!draggedEvent || !draggedEvent.start?.dateTime || !draggedEvent.end?.dateTime) {
    setDraggedEventId(null);
    return;
  }

  const oldStart = new Date(draggedEvent.start.dateTime);
  const oldEnd = new Date(draggedEvent.end.dateTime);
  const duration = oldEnd.getTime() - oldStart.getTime();

  const newStart = new Date(targetDate);
  newStart.setHours(oldStart.getHours(), oldStart.getMinutes(), 0, 0);
  const newEnd = new Date(newStart.getTime() + duration);

  const updatedEvent = {
    ...draggedEvent,
    start: { dateTime: newStart.toISOString() },
    end: { dateTime: newEnd.toISOString() },
  };

  setEvents(events.map((e) => e.id === draggedEventId ? updatedEvent : e));

  // 구글 캘린더에도 반영
  if (accessToken && !draggedEventId.startsWith("planner-")) {
    await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${draggedEventId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          start: { dateTime: newStart.toISOString(), timeZone: "Asia/Seoul" },
          end: { dateTime: newEnd.toISOString(), timeZone: "Asia/Seoul" },
        }),
      }
    );
  }

  setDraggedEventId(null);
  setDragOverDate(null);
};
  const getErrorMessage = (error: unknown) => {
    if (error instanceof Error) return error.message;
    return "알 수 없는 오류가 발생했어요.";
  };

  const loadGoogleCalendar = async (token?: string, targetDate = calendarDate) => {
    const usingToken = token || accessToken;
    setCalendarError("");
    setIsCalendarLoading(true);

    try {
      if (!usingToken) {
        const result = await signInWithPopup(auth, calendarProvider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        const newToken = credential?.accessToken;

        if (!newToken) {
          throw new Error("구글 캘린더 접근 토큰을 받아오지 못했어요.");
        }

        setAccessToken(newToken);
        setIsConnected(true);
        window.sessionStorage.setItem("system-maker-google-calendar-token", newToken);

        await loadGoogleCalendar(newToken, targetDate);
        return newToken;
      }

      const targetStartOfWeek = new Date(targetDate);
      const targetDay = targetStartOfWeek.getDay();
      const targetDiff = targetDay === 0 ? -6 : 1 - targetDay;
      targetStartOfWeek.setDate(targetStartOfWeek.getDate() + targetDiff);

      const timeMin = new Date(targetStartOfWeek);
      timeMin.setHours(0, 0, 0, 0);

      const timeMax = new Date(targetStartOfWeek);
      timeMax.setDate(timeMax.getDate() + 7);
      timeMax.setHours(23, 59, 59, 999);

      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&timeMin=${timeMin.toISOString()}&timeMax=${timeMax.toISOString()}`,
        {
          headers: {
            Authorization: `Bearer ${usingToken}`,
          },
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || "구글 캘린더 일정을 불러오지 못했어요.");
      }

      setEvents([
        ...events.filter((event) => event.id.startsWith("planner-")),
        ...(data.items || []),
      ]);
      setIsConnected(true);
      return usingToken;
    } catch (error) {
      setCalendarError(getErrorMessage(error));
      return null;
    } finally {
      setIsCalendarLoading(false);
    }
  };

  useEffect(() => {
    const savedToken = window.sessionStorage.getItem("system-maker-google-calendar-token");
    if (savedToken) {
      void loadGoogleCalendar(savedToken, calendarDate);
    }
    // Load a saved Google Calendar session once when the calendar view mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goPrevWeek = () => {
    const next = new Date(calendarDate);
    next.setDate(calendarDate.getDate() - 7);
    setCalendarDate(next);
    if (accessToken) loadGoogleCalendar(accessToken, next);
  };

  const goNextWeek = () => {
    const next = new Date(calendarDate);
    next.setDate(calendarDate.getDate() + 7);
    setCalendarDate(next);
    if (accessToken) loadGoogleCalendar(accessToken, next);
  };

  const goToday = () => {
    const next = new Date();
    setCalendarDate(next);
    if (accessToken) loadGoogleCalendar(accessToken, next);
  };

  const formatDateTimeLocal = (date: Date) => {
    return formatDateTimeLocalValue(date);
  };

  const openCreateEventModal = (date?: Date) => {
    const start = date ? new Date(date) : new Date(calendarDate);
    start.setHours(9, 0, 0, 0);

    const end = new Date(start);
    end.setHours(start.getHours() + 1);

    setEditingEventId(null);
    setEventTitle("");
    setEventStart(formatDateTimeLocal(start));
    setEventEnd(formatDateTimeLocal(end));
    setIsEventModalOpen(true);
  };

  const openEditEventModal = (event: GoogleCalendarEvent) => {
    if (!event.start?.dateTime || !event.end?.dateTime) return;

    setEditingEventId(event.id);
    setEventTitle(event.summary || "");
    setEventStart(formatDateTimeLocal(new Date(event.start.dateTime)));
    setEventEnd(formatDateTimeLocal(new Date(event.end.dateTime)));
    setIsEventModalOpen(true);
  };

  const saveGoogleEvent = async () => {
    if (!eventTitle.trim()) return;

    const localEvent = {
      id: editingEventId || `planner-${Date.now()}`,
      summary: eventTitle.trim(),
      start: {
        dateTime: new Date(eventStart).toISOString(),
      },
      end: {
        dateTime: new Date(eventEnd).toISOString(),
      },
    };

    if (!accessToken || editingEventId?.startsWith("planner-")) {
      setEvents(
        editingEventId
          ? events.map((event) => (event.id === editingEventId ? localEvent : event))
          : [...events, localEvent]
      );
      setIsEventModalOpen(false);
      setEditingEventId(null);
      return;
    }

    const token = accessToken || (await loadGoogleCalendar());
    if (!token) return;

    const body = {
      summary: eventTitle.trim(),
      start: {
        dateTime: new Date(eventStart).toISOString(),
        timeZone: "Asia/Seoul",
      },
      end: {
        dateTime: new Date(eventEnd).toISOString(),
        timeZone: "Asia/Seoul",
      },
    };

    const url = editingEventId
      ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${editingEventId}`
      : "https://www.googleapis.com/calendar/v3/calendars/primary/events";

    await fetch(url, {
      method: editingEventId ? "PATCH" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    setIsEventModalOpen(false);
    setEditingEventId(null);
    await loadGoogleCalendar(token);
  };

  const deleteGoogleEvent = async () => {
    if (!editingEventId) return;
    const targetEvent = events.find((event) => event.id === editingEventId);
    if (!targetEvent || !window.confirm("정말 삭제하시겠습니까?")) return;

    if (!accessToken || editingEventId.startsWith("planner-")) {
      setEvents(events.filter((event) => event.id !== editingEventId));
      onTrashItem({
        section: "캘린더",
        title: targetEvent.summary || "제목 없음",
        restore: () => setEvents((currentEvents) => [...currentEvents, targetEvent]),
      });
      setIsEventModalOpen(false);
      setEditingEventId(null);
      return;
    }

    await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${editingEventId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    setIsEventModalOpen(false);
    setEditingEventId(null);
    onTrashItem({
      section: "캘린더",
      title: targetEvent.summary || "제목 없음",
      restore: () => setEvents((currentEvents) => [...currentEvents, targetEvent]),
    });
    await loadGoogleCalendar(accessToken);
  };

  const getEventsByDate = (date: Date) => {
    return events.filter((event) => {
      const eventDate = event.start?.dateTime || event.start?.date;
      if (!eventDate) return false;

      const target = new Date(eventDate);
      return target.toDateString() === date.toDateString();
    });
  };

  const getEventPosition = (event: GoogleCalendarEvent) => {
    if (!event.start?.dateTime || !event.end?.dateTime) {
      return { top: 0, height: 36 };
    }

    const start = new Date(event.start.dateTime);
    const end = new Date(event.end.dateTime);

    const startMinutes = (start.getHours() - startHour) * 60 + start.getMinutes();
    const durationMinutes = Math.max((end.getTime() - start.getTime()) / 60000, 30);

    return {
      top: (startMinutes / 60) * hourHeight,
      height: Math.max((durationMinutes / 60) * hourHeight, 36),
    };
  };

  return (
    <div>
      <div style={pageHeaderStyle}>
        <div>
          <h2 style={{ fontSize: "clamp(20px, 5vw, 36px)", fontWeight: "bold", marginBottom: "8px", whiteSpace: "nowrap" }}>
              캘린더
            </h2>

            <p style={{ color: "#8A8178", margin: 0 }}>
            구글 캘린더 일정이 시간대에 맞춰 표시됩니다.
          </p>
          {calendarError && (
            <p style={{ color: "#B40023", margin: "10px 0 0", fontSize: "14px" }}>
              {calendarError}
            </p>
          )}
        </div>

        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" as const }}>
          <button
            onClick={() => loadGoogleCalendar()}
            disabled={isCalendarLoading}
            style={{
              ...todayButtonStyle,
              opacity: isCalendarLoading ? 0.6 : 1,
            }}
          >
            {isCalendarLoading
              ? "불러오는 중"
              : isConnected
                ? "구글 일정 새로고침"
                : "구글 캘린더 연결"}
          </button>

          <button onClick={() => openCreateEventModal()} style={todayButtonStyle}>
            + 일정 추가
          </button>

          <button onClick={goPrevWeek} style={weekButtonStyle}>
            {"<"}
          </button>

          <button onClick={goToday} style={todayButtonStyle}>
            오늘
          </button>

          <button onClick={goNextWeek} style={weekButtonStyle}>
            {">"}
          </button>
        </div>
      </div>

      <div style={calendarShellStyle}>
        <div style={calendarTitleRowStyle}>
          <div>
            <div style={calendarMonthTitleStyle}>
              {calendarDate.getFullYear()}년 {calendarDate.getMonth() + 1}월
            </div>
            <div style={calendarRangeTextStyle}>
              {weekDays[0].toLocaleDateString("ko-KR", { month: "long", day: "numeric" })} -{" "}
              {weekDays[6].toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}
            </div>
          </div>
        </div>

        <div style={calendarFrameStyle}>
          <div style={googleCalendarGridStyle}>
            <div style={calendarHeaderCellStyle}></div>

            {weekDays.map((date) => {
              const isToday = date.toDateString() === new Date().toDateString();

              return (
                <div key={date.toDateString()} style={calendarHeaderCellStyle}>
                  <div style={calendarDayNameStyle}>
                    {date.toLocaleDateString("ko-KR", { weekday: "short" })}
                  </div>

                  <button
                    onClick={() => openCreateEventModal(date)}
                    style={{
                      ...calendarDayNumberButtonStyle,
                      background: isToday ? "#1A73E8" : "transparent",
                      color: isToday ? "white" : "#202124",
                    }}
                  >
                    {date.getDate()}
                  </button>
                </div>
              );
            })}
          </div>

          <div style={calendarScrollAreaStyle}>
            <div style={googleCalendarGridStyle}>
              <div style={calendarTimeColumnStyle}>
                {Array.from({ length: endHour - startHour + 1 }, (_, i) => (
                  <div key={i} style={{ ...calendarTimeLabelStyle, height: hourHeight }}>
                    {startHour + i}:00
                  </div>
                ))}
              </div>

              {weekDays.map((date) => {
                const dayEvents = getEventsByDate(date);
                const isToday = date.toDateString() === new Date().toDateString();

                return (
                  <div
                    key={date.toDateString()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverDate(date.toDateString());
                    }}
                    onDragLeave={() => setDragOverDate(null)}
                    onDrop={() => handleEventDrop(date)}
                    onMouseDown={(e) => {
                      if ((e.target as HTMLElement).closest("button")) return;
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      const { hours, minutes } = getTimeFromY(e.clientY, rect.top);
                      const start = new Date(date);
                      start.setHours(hours, minutes, 0, 0);
                      setCreateDate(start);
                      setCreateStartY(e.clientY);
                      setIsCreatingEvent(true);
                      setCreatePreview({
                        top: (hours - startHour) * hourHeight + (minutes / 60) * hourHeight,
                        height: hourHeight,
                      });
                    }}
                    onMouseMove={(e) => {
                      if (!isCreatingEvent || !createDate) return;
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      const { hours, minutes } = getTimeFromY(e.clientY, rect.top);
                      const endTime = new Date(date);
                      endTime.setHours(hours, minutes, 0, 0);
                      const startTop = (createDate.getHours() - startHour) * hourHeight + (createDate.getMinutes() / 60) * hourHeight;
                      const endTop = (hours - startHour) * hourHeight + (minutes / 60) * hourHeight;
                      if (endTop > startTop) {
                        setCreatePreview({ top: startTop, height: Math.max(hourHeight / 2, endTop - startTop) });
                      }
                    }}
                    onMouseUp={(e) => {
                      if (!isCreatingEvent || !createDate) {
                        setIsCreatingEvent(false);
                        return;
                      }
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      const { hours, minutes } = getTimeFromY(e.clientY, rect.top);
                      const end = new Date(date);
                      end.setHours(hours, minutes, 0, 0);
                      if (end <= createDate) {
                        end.setTime(createDate.getTime() + 60 * 60 * 1000);
                      }
                      setEditingEventId(null);
                      setEventTitle("");
                      setEventStart(formatDateTimeLocalValue(createDate));
                      setEventEnd(formatDateTimeLocalValue(end));
                      setIsEventModalOpen(true);
                      setIsCreatingEvent(false);
                      setCreatePreview(null);
                      setCreateDate(null);
                    }}
                    style={{
                      ...calendarDayColumnStyle,
                      height: (endHour - startHour + 1) * hourHeight,
                      background: dragOverDate === date.toDateString()
                        ? "#EEF5FF"
                        : isToday ? "#F8FBFF" : "white",
                      transition: "background 0.15s",
                      userSelect: "none",
                      cursor: isCreatingEvent ? "ns-resize" : "default",
                    }}
                  >
                    {Array.from({ length: endHour - startHour + 1 }, (_, i) => (
                      <div
                        key={i}
                        style={{
                          ...calendarHourLineStyle,
                          height: hourHeight,
                        }}
                      />
                    ))}
                    {isCreatingEvent && createPreview && createDate?.toDateString() === date.toDateString() && (
                    <div style={{
                      position: "absolute",
                      left: "4px",
                      right: "4px",
                      top: createPreview.top,
                      height: createPreview.height,
                      background: "#C9DEF9",
                      borderRadius: "6px",
                      border: "2px solid #1A73E8",
                      padding: "4px 8px",
                      fontSize: "12px",
                      color: "#1A73E8",
                      fontWeight: "600",
                      pointerEvents: "none",
                      zIndex: 5,
                    }}>
                      {createDate.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })}
                    </div>
                  )}
                    {dayEvents.map((event) => {
                      if (!event.start?.dateTime) return null;

                      const position = getEventPosition(event);

                      return (
                       <button
                            key={event.id}
                            draggable
                            onDragStart={() => handleEventDragStart(event.id)}
                            onDragEnd={() => {
                              setDraggedEventId(null);
                              setDragOverDate(null);
                            }}
                            onClick={() => openEditEventModal(event)}
                            style={{
                              ...calendarEventButtonStyle,
                              top: position.top,
                              height: position.height,
                              opacity: draggedEventId === event.id ? 0.5 : 1,
                              cursor: "grab",
                            }}
                          >
                          <span>{event.summary || "제목 없음"}</span>
                          <span style={calendarEventTimeStyle}>
                            {new Date(event.start.dateTime).toLocaleTimeString("ko-KR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {isEventModalOpen && (
        <div style={modalBackdropStyle} onClick={(e) => { if (e.target === e.currentTarget) setIsEventModalOpen(false); }}>
          <div style={{ background: "white", borderRadius: "12px", boxShadow: "0 8px 32px rgba(0,0,0,0.2)", width: "min(480px, calc(100vw - 32px))", maxHeight: "90vh", overflowY: "auto", padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ fontSize: "20px", fontWeight: "600", margin: 0, color: "#202124" }}>
                {editingEventId ? "일정 수정" : "새 일정"}
              </h2>
              <button onClick={() => setIsEventModalOpen(false)} style={{ width: "32px", height: "32px", borderRadius: "50%", border: "none", background: "transparent", fontSize: "20px", cursor: "pointer" }}>×</button>
            </div>
            <input value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveGoogleEvent(); }} autoFocus placeholder="제목 추가" style={{ width: "100%", border: "none", borderBottom: "2px solid #1A73E8", fontSize: "22px", padding: "8px 0", marginBottom: "24px", outline: "none", boxSizing: "border-box", color: "#202124" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <span style={{ fontSize: "20px" }}>🕐</span>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  <input type="datetime-local" value={eventStart} onChange={(e) => setEventStart(e.target.value)} style={{ border: "1px solid #E8EAED", borderRadius: "8px", padding: "8px 12px", fontSize: "14px", color: "#202124", outline: "none" }} />
                  <span style={{ color: "#5F6368" }}>→</span>
                  <input type="datetime-local" value={eventEnd} onChange={(e) => setEventEnd(e.target.value)} style={{ border: "1px solid #E8EAED", borderRadius: "8px", padding: "8px 12px", fontSize: "14px", color: "#202124", outline: "none" }} />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <span style={{ fontSize: "20px" }}>📍</span>
                <input placeholder="장소 추가" style={{ flex: 1, border: "none", borderBottom: "1px solid #E8EAED", padding: "8px 0", fontSize: "14px", outline: "none", color: "#202124" }} />
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
                <span style={{ fontSize: "20px", marginTop: "4px" }}>📝</span>
                <textarea placeholder="메모 추가" style={{ flex: 1, border: "none", borderBottom: "1px solid #E8EAED", padding: "8px 0", fontSize: "14px", outline: "none", resize: "none", minHeight: "60px", color: "#202124", fontFamily: "inherit" }} />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>{editingEventId && <button onClick={deleteGoogleEvent} style={{ border: "none", background: "transparent", color: "#B40023", fontSize: "14px", cursor: "pointer", padding: "8px 12px", borderRadius: "6px" }}>삭제</button>}</div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => setIsEventModalOpen(false)} style={{ border: "1px solid #E8EAED", background: "white", color: "#5F6368", fontSize: "14px", cursor: "pointer", padding: "8px 20px", borderRadius: "6px" }}>취소</button>
                <button onClick={saveGoogleEvent} style={{ border: "none", background: "#1A73E8", color: "white", fontSize: "14px", fontWeight: "600", cursor: "pointer", padding: "8px 20px", borderRadius: "6px" }}>{editingEventId ? "저장" : "추가"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ===== 스타일 =====
const formatDateTimeLocalValue = (date: Date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
};

const pageHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: "20px",
  flexWrap: "wrap" as const,
  gap: "12px",
};

const todayButtonStyle = {
  height: "44px",
  padding: "0 18px",
  borderRadius: "14px",
  border: "1px solid #E8E1D8",
  background: "#FFFCF8",
  fontSize: "15px",
  fontWeight: "bold",
  cursor: "pointer",
};

const weekButtonStyle = {
  width: "44px",
  height: "44px",
  borderRadius: "14px",
  border: "1px solid #E8E1D8",
  background: "#FFFCF8",
  fontSize: "18px",
  fontWeight: "bold",
  cursor: "pointer",
};

const calendarShellStyle = {
  background: "#FFFFFF",
  borderRadius: "24px",
  border: "1px solid #DADCE0",
  boxShadow: "0 10px 30px rgba(60,64,67,0.08)",
  overflow: "hidden",
};

const calendarTitleRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "22px 24px",
  borderBottom: "1px solid #E8EAED",
  background: "#FFFFFF",
};

const calendarMonthTitleStyle = {
  color: "#202124",
  fontSize: "26px",
  fontWeight: "600",
};

const calendarRangeTextStyle = {
  color: "#5F6368",
  fontSize: "13px",
  marginTop: "6px",
};

const calendarFrameStyle = {
  background: "#FFFFFF",
};

const googleCalendarGridStyle = {
  display: "grid",
  gridTemplateColumns: "64px repeat(7, minmax(120px, 1fr))",
  minWidth: "980px",
};

const calendarHeaderCellStyle = {
  minHeight: "88px",
  borderRight: "1px solid #E8EAED",
  borderBottom: "1px solid #E8EAED",
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "center",
  justifyContent: "center",
  background: "#FFFFFF",
};

const calendarDayNameStyle = {
  color: "#5F6368",
  fontSize: "12px",
  fontWeight: "600",
  textTransform: "uppercase" as const,
};

const calendarDayNumberButtonStyle = {
  marginTop: "8px",
  width: "42px",
  height: "42px",
  borderRadius: "50%",
  border: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "24px",
  fontWeight: "500",
  cursor: "pointer",
};

const calendarScrollAreaStyle = {
  maxHeight: "640px",
  overflow: "auto",
};

const calendarTimeColumnStyle = {
  borderRight: "1px solid #E8EAED",
  background: "#FFFFFF",
};

const calendarTimeLabelStyle = {
  color: "#70757A",
  fontSize: "11px",
  textAlign: "right" as const,
  paddingRight: "10px",
  transform: "translateY(-8px)",
  boxSizing: "border-box" as const,
};

const calendarDayColumnStyle = {
  position: "relative" as const,
  borderRight: "1px solid #E8EAED",
};

const calendarHourLineStyle = {
  borderBottom: "1px solid #E8EAED",
  boxSizing: "border-box" as const,
};

const calendarEventButtonStyle = {
  position: "absolute" as const,
  left: "8px",
  right: "8px",
  background: "#D2E3FC",
  color: "#174EA6",
  borderRadius: "8px",
  padding: "7px 9px",
  fontSize: "12px",
  fontWeight: "600",
  overflow: "hidden",
  border: "1px solid #AECBFA",
  textAlign: "left" as const,
  cursor: "pointer",
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "flex-start",
  gap: "3px",
  boxShadow: "0 1px 2px rgba(60,64,67,0.12)",
};

const calendarEventTimeStyle = {
  fontSize: "11px",
  fontWeight: "400",
  color: "#1967D2",
};

const modalBackdropStyle = {
  position: "fixed" as const,
  inset: 0,
  background: "rgba(0,0,0,0.35)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 100,
};
