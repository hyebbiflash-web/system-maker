"use client";

import LoginPage from "./login";
import { getRedirectResult } from "firebase/auth";
import { useEffect, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from "react";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { Settings } from "lucide-react";
import { auth, calendarProvider } from "./firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, setDoc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

type Area = "일" | "관리" | "일상";

type Todo = {
  id: number;
  title: string;
  area: Area;
  subArea: string;
  cellKey: string;
  importance: number;
  urgency: number;
  progress: number;
  dueDate: string;
  done: boolean;
};

type Memo = {
  id: number;
  content: string;
};

type Project = {
  id: number;
  title: string;
  desc: string;
  area: Area;
  subArea: string;
  dueDate: string;
  urgency: number;
  importance: number;
  progress: number;
  status: string;
  memo: string;
  todos: ProjectTodo[];
};

type ProjectTodo = {
  id: number;
  title: string;
  done: boolean;
  children: ProjectTodo[];
};

type ProjectTodoSeed = string | {
  title: string;
  children?: ProjectTodoSeed[];
};

type RecordSection = {
  id: number;
  title: string;
  desc: string;
  items: string[];
  memos: RecordMemo[];
};

type RecordMemo = {
  id: number;
  title: string;
  content: string;
  createdAt: string;
  createdAtMs: number;
  source?: string;
  subCategory: string;
};

type GoogleCalendarEvent = {
  id: string;
  summary?: string;
  start?: {
    date?: string;
    dateTime?: string;
  };
  end?: {
    dateTime?: string;
  };
};

type TrashItem = {
  id: number;
  section: "캘린더" | "플래너" | "프로젝트 센터" | "기록 센터";
  title: string;
  deletedAt: string;
  restore: () => void;
};

const plannerAreas: Area[] = ["일", "관리", "일상"];

const linkedRecordDescriptions: Record<Area, string> = {
  일: "플래너의 일 영역과 연결된 업무 기록 공간",
  관리: "플래너의 관리 영역과 연결된 성장, 공부, 건강 기록 공간",
  일상: "플래너의 일상 영역과 연결된 개인 기록 공간",
};

const recordColorPalette = [
  "#B40023",
  "#D64B2A",
  "#C56A00",
  "#6B7D00",
  "#00806A",
  "#1B64DA",
  "#6D5BD0",
  "#C03584",
];

const getPaletteColor = (key: string, index = 0) => {
  const score = key.split("").reduce((sum, char) => sum + char.charCodeAt(0), index);
  return recordColorPalette[Math.abs(score) % recordColorPalette.length];
};

const createLinkedRecordSections = (linkedCategories: Record<Area, string[]>): RecordSection[] =>
  plannerAreas.map((area, index) => ({
    id: index + 1,
    title: area,
    desc: linkedRecordDescriptions[area],
    items: linkedCategories[area],
    memos: [],
  }));

const syncRecordSections = (
  records: RecordSection[],
  linkedCategories: Record<Area, string[]>
): RecordSection[] => {
  const linkedTitles = new Set(plannerAreas);
  const syncedRecords = plannerAreas.map((area, index) => {
    const previousRecord = records.find((record) => record.title === area);
    const nextItems = linkedCategories[area];

    return {
      id: previousRecord?.id || index + 1,
      title: area,
      desc: previousRecord?.desc || linkedRecordDescriptions[area],
      items: nextItems,
      memos: (previousRecord?.memos || []).filter((memo) => nextItems.includes(memo.subCategory)),
    };
  });
  const customRecords = records.filter((record) => !linkedTitles.has(record.title as Area));

  return [...syncedRecords, ...customRecords];
};

let projectTodoIdSeed = 1000;
const createProjectTodoId = () => {
  projectTodoIdSeed += 1;
  return projectTodoIdSeed;
};

const shouldSubmitByEnter = (event: KeyboardEvent<HTMLInputElement>) => {
  if (event.key !== "Enter" || event.nativeEvent.isComposing || event.keyCode === 229) {
    return false;
  }

  event.preventDefault();
  return true;
};

const formatDateTimeLocalValue = (date: Date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
};

const formatTwentyFourHour = (date: Date) =>
  date.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

export default function Home() {
  const [user, setUser] = useState<import("firebase/auth").User | null>(null);
const [authLoading, setAuthLoading] = useState(true);

useEffect(() => {
  getRedirectResult(auth)
    .then((result) => {
      if (result?.user) {
        setUser(result.user);
      }
    })
    .catch(() => {})
    .finally(() => {
      const unsub = onAuthStateChanged(auth, (u) => {
        setUser(u);
        setAuthLoading(false);
      });
      return unsub;
    });
}, []);
  const [activePage, setActivePage] = useState<"calendar" | "planner" | "project" | "record" | "trash">("calendar");

  const [isTodoModalOpen, setIsTodoModalOpen] = useState(false);
  const [isMemoModalOpen, setIsMemoModalOpen] = useState(false);
  const [isTodoListOpen, setIsTodoListOpen] = useState(false);
  const [editingTodoId, setEditingTodoId] = useState<number | null>(null);

  const [title, setTitle] = useState("");
  const [area, setArea] = useState<Area>("일");
  const [subArea, setSubArea] = useState("본업");
  const [newSubArea, setNewSubArea] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [progress, setProgress] = useState(0);
  const [importance, setImportance] = useState(0);
  const [urgency, setUrgency] = useState(0);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [isSubAreaOpen, setIsSubAreaOpen] = useState(false);

  const [memos, setMemos] = useState<Memo[]>([]);
  const [memoContent, setMemoContent] = useState("");
  const [calendarEvents, setCalendarEvents] = useState<GoogleCalendarEvent[]>([]);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [scheduleTitle, setScheduleTitle] = useState("");
  const [scheduleStart, setScheduleStart] = useState("");
  const [scheduleEnd, setScheduleEnd] = useState("");
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);

  const [subAreaOptions, setSubAreaOptions] = useState<Record<Area, string[]>>({
    일: ["본업", "사이드"],
    관리: ["공부", "뷰티", "건강", "경제"],
    일상: ["가족", "관계", "그외"],
  });

  const [currentDate, setCurrentDate] = useState(new Date());

  const addTrashItem = (item: Omit<TrashItem, "id" | "deletedAt">) => {
    setTrashItems((currentItems) => [
      {
        ...item,
        id: Date.now(),
        deletedAt: new Date().toLocaleString("ko-KR"),
      },
      ...currentItems,
    ]);
  };

  const restoreTrashItem = (trashId: number) => {
    const target = trashItems.find((item) => item.id === trashId);
    if (!target) return;

    target.restore();
    setTrashItems(trashItems.filter((item) => item.id !== trashId));
  };

  const today = new Date();
  const startOfWeek = new Date(currentDate);
  const currentDay = currentDate.getDay();
  const diff = currentDay === 0 ? -6 : 1 - currentDay;
  startOfWeek.setDate(currentDate.getDate() + diff);

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(startOfWeek);
    date.setDate(startOfWeek.getDate() + i);

    return {
      key: date.toDateString(),
      label: date.toLocaleDateString("ko-KR", { weekday: "short" }),
      date: date.getDate(),
      isToday: date.toDateString() === today.toDateString(),
    };
  });

  const plannerCells = [
    {
      key: "memo",
      label: `${currentDate.getMonth() + 1}월`,
      date: null,
      isToday: false,
    },
    ...weekDays,
  ];

  const goPrevWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() - 7);
    setCurrentDate(newDate);
  };

  const goNextWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() + 7);
    setCurrentDate(newDate);
  };

  const goToday = () => {
    setCurrentDate(new Date());
  };

  const sortTodos = (todoList: Todo[]) => {
    return [...todoList].sort((a, b) => {
      const scoreA = a.urgency * 10 + a.importance;
      const scoreB = b.urgency * 10 + b.importance;

      if (scoreB !== scoreA) return scoreB - scoreA;

      return a.id - b.id;
    });
  };

  const openTodoModal = (cellKey: string) => {
    setEditingTodoId(null);
    setTitle("");
    setArea("일");
    setSubArea("본업");
    setIsSubAreaOpen(false);

    if (cellKey === "memo") {
      setDueDate("");
    } else {
      const selectedDate = new Date(cellKey);
      const yyyy = selectedDate.getFullYear();
      const mm = String(selectedDate.getMonth() + 1).padStart(2, "0");
      const dd = String(selectedDate.getDate()).padStart(2, "0");
      setDueDate(`${yyyy}-${mm}-${dd}`);
    }

    setProgress(0);
    setImportance(0);
    setUrgency(0);
    setIsTodoModalOpen(true);
  };

  const openEditTodoModal = (todo: Todo) => {
    setEditingTodoId(todo.id);
    setTitle(todo.title);
    setArea(todo.area);
    setSubArea(todo.subArea);
    setDueDate(todo.dueDate);
    setProgress(todo.progress);
    setImportance(todo.importance);
    setUrgency(todo.urgency);
    setIsSubAreaOpen(false);
    setIsTodoModalOpen(true);
  };

  const openScheduleModal = (cellKey: string, event?: GoogleCalendarEvent) => {
    if (event?.start?.dateTime && event.end?.dateTime) {
      setEditingScheduleId(event.id);
      setScheduleTitle(event.summary || "");
      setScheduleStart(formatDateTimeLocalValue(new Date(event.start.dateTime)));
      setScheduleEnd(formatDateTimeLocalValue(new Date(event.end.dateTime)));
      setIsScheduleModalOpen(true);
      return;
    }

    const start = new Date(cellKey);
    start.setHours(9, 0, 0, 0);
    const end = new Date(start);
    end.setHours(10, 0, 0, 0);

    setEditingScheduleId(null);
    setScheduleTitle("");
    setScheduleStart(formatDateTimeLocalValue(start));
    setScheduleEnd(formatDateTimeLocalValue(end));
    setIsScheduleModalOpen(true);
  };

  const addSubArea = () => {
    const clean = newSubArea.trim();
    if (!clean) return;

    if (!subAreaOptions[area].includes(clean)) {
      setSubAreaOptions({
        ...subAreaOptions,
        [area]: [...subAreaOptions[area], clean],
      });
    }

    setSubArea(clean);
    setNewSubArea("");
  };

  const updateSubArea = (oldValue: string, newValue: string) => {
    const clean = newValue.trim();
    if (!clean) return;

    setSubAreaOptions({
      ...subAreaOptions,
      [area]: subAreaOptions[area].map((item) =>
        item === oldValue ? clean : item
      ),
    });

    if (subArea === oldValue) setSubArea(clean);
  };

  const deleteSubArea = (target: string) => {
    const nextList = subAreaOptions[area].filter((item) => item !== target);

    setSubAreaOptions({
      ...subAreaOptions,
      [area]: nextList,
    });

    if (subArea === target) setSubArea(nextList[0] || "");
  };

  const saveTodo = () => {
    if (!title.trim()) return;

    const finalCellKey = dueDate ? new Date(dueDate).toDateString() : "memo";

    if (editingTodoId) {
      setTodos(
        todos.map((todo) =>
          todo.id === editingTodoId
            ? {
                ...todo,
                title: title.trim(),
                area,
                subArea,
                cellKey: finalCellKey,
                importance,
                urgency,
                progress,
                dueDate,
              }
            : todo
        )
      );
    } else {
      setTodos([
        ...todos,
        {
          id: Date.now(),
          title: title.trim(),
          area,
          subArea,
          cellKey: finalCellKey,
          importance,
          urgency,
          progress,
          dueDate,
          done: false,
        },
      ]);
    }

    setTitle("");
    setArea("일");
    setSubArea("본업");
    setDueDate("");
    setProgress(0);
    setImportance(0);
    setUrgency(0);
    setEditingTodoId(null);
    setIsSubAreaOpen(false);
    setIsTodoModalOpen(false);
  };

  const deletePlannerTodo = () => {
    if (!editingTodoId) return;
    const targetTodo = todos.find((todo) => todo.id === editingTodoId);
    if (!targetTodo || !window.confirm("정말 삭제하시겠습니까?")) return;

    setTodos(todos.filter((todo) => todo.id !== editingTodoId));
    addTrashItem({
      section: "플래너",
      title: targetTodo.title,
      restore: () => setTodos((currentTodos) => [...currentTodos, targetTodo]),
    });
    setEditingTodoId(null);
    setIsTodoModalOpen(false);
  };

  const saveMemo = () => {
    if (!memoContent.trim()) return;

    setMemos([
      ...memos,
      {
        id: Date.now(),
        content: memoContent.trim(),
      },
    ]);

    setMemoContent("");
    setIsMemoModalOpen(false);
  };

  const savePlannerSchedule = () => {
    if (!scheduleTitle.trim() || !scheduleStart || !scheduleEnd) return;

    const nextEvent = {
      id: editingScheduleId || `planner-${Date.now()}`,
      summary: scheduleTitle.trim(),
      start: {
        dateTime: new Date(scheduleStart).toISOString(),
      },
      end: {
        dateTime: new Date(scheduleEnd).toISOString(),
      },
    };

    setCalendarEvents(
      editingScheduleId
        ? calendarEvents.map((event) => (event.id === editingScheduleId ? nextEvent : event))
        : [...calendarEvents, nextEvent]
    );
    setScheduleTitle("");
    setScheduleStart("");
    setScheduleEnd("");
    setEditingScheduleId(null);
    setIsScheduleModalOpen(false);
  };

  const deletePlannerSchedule = () => {
    if (!editingScheduleId) return;
    const targetEvent = calendarEvents.find((event) => event.id === editingScheduleId);
    if (!targetEvent) return;
    if (!window.confirm("정말 삭제하시겠습니까?")) return;

    setCalendarEvents(calendarEvents.filter((event) => event.id !== editingScheduleId));
    addTrashItem({
      section: "캘린더",
      title: targetEvent.summary || "제목 없음",
      restore: () => setCalendarEvents((currentEvents) => [...currentEvents, targetEvent]),
    });
    setScheduleTitle("");
    setScheduleStart("");
    setScheduleEnd("");
    setEditingScheduleId(null);
    setIsScheduleModalOpen(false);
  };

  const toggleDone = (id: number) => {
    setTodos(
      todos.map((todo) =>
        todo.id === id ? { ...todo, done: !todo.done } : todo
      )
    );
  };

  const moveTodo = (todoId: number, targetCellKey: string) => {
    setTodos(
      todos.map((todo) =>
        todo.id === todoId ? { ...todo, cellKey: targetCellKey } : todo
      )
    );
  };

  const createPlannerTodoFromProject = ({
    title,
    area,
    subArea,
    dueDate,
    progress,
  }: {
    title: string;
    area: Area;
    subArea: string;
    dueDate: string;
    urgency: number;
    importance: number;
    progress: number;
  }) => {
    if (!dueDate) return;

    setTodos([
      ...todos,
      {
        id: Date.now(),
        title: `[프로젝트] ${title}`,
        area,
        subArea,
        cellKey: new Date(dueDate).toDateString(),
        importance,
        urgency,
        progress,
        dueDate,
        done: false,
      },
    ]);
  };

  const undatedTodos = sortTodos(todos.filter((todo) => !todo.dueDate));
  const datedTodos = [...todos.filter((todo) => todo.dueDate)].sort((a, b) => {
    const dateGap = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    if (dateGap !== 0) return dateGap;
    return a.id - b.id;
  });
  if (authLoading) {
  return (
    <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center">
      <div className="text-[#8A8178] text-lg">로딩 중...</div>
    </div>
  );
}

if (!user) {
  return <LoginPage onLogin={() => {}} />;
}

  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  return (
    <main style={{ display: "flex", height: "100vh", background: "#F7F8FA" }}>
      <div style={{
        ...sidebarStyle,
        display: "none",
      }} className="hidden md:flex">
        <h1 style={{ fontSize: "18px", fontWeight: "bold", marginBottom: "18px" }}>
          System Maker
        </h1>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <MenuItem
            title="캘린더"
            active={activePage === "calendar"}
            onClick={() => setActivePage("calendar")}
          />

          <MenuItem
            title="플래너"
            active={activePage === "planner"}
            onClick={() => setActivePage("planner")}
          />

          <MenuItem
            title="프로젝트 센터"
            active={activePage === "project"}
            onClick={() => setActivePage("project")}
          />
          <MenuItem
            title="기록 센터"
            active={activePage === "record"}
            onClick={() => setActivePage("record")}
          />
          <MenuItem
            title="휴지통"
            active={activePage === "trash"}
            onClick={() => setActivePage("trash")}
          />
        </div>
      </div>

      <div style={{ flex: 1, padding: "16px", overflow: "auto", paddingBottom: "80px" }}>
        {activePage === "calendar" ? (
          <CalendarPage
            events={calendarEvents}
            setEvents={setCalendarEvents}
            onTrashItem={addTrashItem}
          />
        ) : activePage === "project" ? (
          <ProjectPage
            onCreatePlannerTodo={createPlannerTodoFromProject}
            onTrashItem={addTrashItem}
          />
        ) : activePage === "record" ? (
          <RecordPage linkedCategories={subAreaOptions} onTrashItem={addTrashItem} />
        ) : activePage === "trash" ? (
          <TrashPage trashItems={trashItems} onRestore={restoreTrashItem} />
        ) : (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "28px",
              }}
            >
              <div>
                <h2 style={{ fontSize: "clamp(20px, 5vw, 36px)", fontWeight: "bold", marginBottom: "8px", whiteSpace: "nowrap" }}>
                  플래너
                </h2>

                <p style={{ color: "#8A8178", margin: 0 }}>주간 플래너</p>
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => setIsTodoListOpen(true)} style={todayButtonStyle}>
                  To do
                </button>
                <button
                  onClick={() => openTodoModal("memo")}
                  style={plannerQuickAddButtonStyle}
                  title="할 일 바로 추가"
                  aria-label="할 일 바로 추가"
                >
                  +
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

            <div style={plannerOuterStyle}>
              <div style={plannerGridStyle}>
                {plannerCells.map((cell, index) => {
                  const cellTodos = todos.filter((todo) => todo.cellKey === cell.key);
                  const cellSchedules = calendarEvents
                    .filter((event) => {
                      const eventDate = event.start?.dateTime || event.start?.date;
                      return eventDate && new Date(eventDate).toDateString() === cell.key;
                    })
                    .sort((a, b) => {
                      const aTime = new Date(a.start?.dateTime || a.start?.date || 0).getTime();
                      const bTime = new Date(b.start?.dateTime || b.start?.date || 0).getTime();
                      return aTime - bTime;
                    });

                  return (
                    <div
                      key={cell.key}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        const todoId = Number(e.dataTransfer.getData("todoId"));
                        moveTodo(todoId, cell.key);
                      }}
                      style={{
                        padding: "14px",
                        borderRight: index % 4 === 3 ? "none" : "1px solid #dfe3e8",
                        borderBottom: index >= 4 ? "none" : "1px solid #dfe3e8",
                        position: "relative",
                        background: cell.isToday ? "#fbfdff" : "#fff",
                        overflow: "auto",
                      }}
                    >
                      <div style={{ textAlign: "center", color: "#8A8178", fontSize: "12px" }}>
                        {cell.date && <div>{cell.date}</div>}
                        <div style={{ color: cell.isToday ? "#3182f6" : "#8A8178" }}>
                          {cell.label}
                        </div>
                      </div>

                      {cell.isToday && <TodayBadge />}

                      {cell.key === "memo" ? (
                        <MemoCell
                          memos={memos}
                          todos={cellTodos}
                          sortTodos={sortTodos}
                          openMemoModal={() => setIsMemoModalOpen(true)}
                          openTodoModal={openTodoModal}
                          openEditTodoModal={openEditTodoModal}
                          toggleDone={toggleDone}
                        />
                      ) : (
                        <>
                          <div style={plannerScheduleSectionStyle}>
                            <div style={plannerSectionHeaderStyle}>
                              <span>일정</span>
                              <button onClick={() => openScheduleModal(cell.key)} style={miniAddButtonStyle}>
                                + 일정 추가
                              </button>
                            </div>

                            <div style={plannerScheduleListStyle}>
                              {cellSchedules.length === 0 && (
                                <span style={plannerEmptyTextStyle}>등록된 일정 없음</span>
                              )}
                              {cellSchedules.map((schedule) => (
                                <button
                                  key={schedule.id}
                                  onClick={() => openScheduleModal(cell.key, schedule)}
                                  style={plannerScheduleItemStyle}
                                >
                                  {schedule.start?.dateTime
                                    ? `${formatTwentyFourHour(new Date(schedule.start.dateTime))} ${schedule.summary || "제목 없음"}`
                                    : schedule.summary || "제목 없음"}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div style={plannerTodoSectionStyle}>
                            <div style={plannerSectionHeaderStyle}>
                              <span>할일</span>
                              <button onClick={() => openTodoModal(cell.key)} style={miniAddButtonStyle}>
                                + 할일 추가
                              </button>
                            </div>

                            <TodoAreaGroups
                              todos={cellTodos}
                              sortTodos={sortTodos}
                              openEditTodoModal={openEditTodoModal}
                              toggleDone={toggleDone}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {isTodoModalOpen && (
        <div style={modalBackdropStyle}>
          <div style={modalBoxStyle}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <h2 style={{ fontSize: "36px", fontWeight: "bold", margin: 0 }}>
                  {editingTodoId ? "할일 수정" : "할일 추가"}
                </h2>
                <p style={{ color: "#6b7280", marginTop: "12px" }}>
                  할 일의 영역, 하위 영역, 중요도, 긴급도, 진행률을 입력해줘.
                </p>
              </div>

              <button
                onClick={() => {
                  setIsSubAreaOpen(false);
                  setIsTodoModalOpen(false);
                }}
                style={closeButtonStyle}
              >
                ×
              </button>
            </div>

            <div style={twoColumnStyle}>
              <div>
                <FormLabel title="할 일 제목" />
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  style={inputStyle}
                  placeholder="예: 웨딩 촬영 업체 비교하기"
                />
              </div>

              <div>
                <FormLabel title="마감일" />
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={splitRowStyle}>
              <div style={halfBlockStyle}>
                <div style={{ flex: 1 }}>
                  <FormLabel title="긴급도" />
                  <StarPicker value={urgency} onChange={setUrgency} />
                </div>

                <div style={{ flex: 1 }}>
                  <FormLabel title="중요도" />
                  <StarPicker value={importance} onChange={setImportance} />
                </div>
              </div>

              <div style={halfBlockStyle}>
                <div style={{ width: "100%" }}>
                  <FormLabel title="진행률" />
                  <ProgressBarInput value={progress} onChange={setProgress} />
                </div>
              </div>
            </div>

            <div style={twoColumnStyle}>
              <div>
                <FormLabel title="영역" />

                <div style={{ position: "relative" }}>
                  <select
                    style={selectStyle}
                    value={area}
                    onChange={(e) => {
                      const selectedArea = e.target.value as Area;
                      setArea(selectedArea);
                      setSubArea(subAreaOptions[selectedArea][0] || "");
                      setIsSubAreaOpen(false);
                    }}
                  >
                    <option>일</option>
                    <option>관리</option>
                    <option>일상</option>
                  </select>

                  <span style={selectArrowStyle}>⌄</span>
                </div>
              </div>

              <div style={{ position: "relative" }}>
                <FormLabel title="하위 영역" />

                <button
                  onClick={() => setIsSubAreaOpen(!isSubAreaOpen)}
                  style={subAreaSelectButtonStyle}
                >
                  <span>{subArea || "하위 영역 선택"}</span>
                  <span style={selectArrowStyle}>⌄</span>
                </button>

                {isSubAreaOpen && (
                  <div style={subDropdownStyle}>
                    <div style={subAddBoxStyle}>
                      <div style={subSectionTitleStyle}>새 하위 영역 추가</div>

                      <div style={{ display: "flex", gap: "8px" }}>
                        <input
                          value={newSubArea}
                          onChange={(e) => setNewSubArea(e.target.value)}
                          placeholder="예: 콘텐츠"
                          style={{ ...inputStyle, height: "44px", background: "#FFFDF9" }}
                        />
                        <button style={{ ...subButtonSmall, height: "44px" }} onClick={addSubArea}>
                          추가
                        </button>
                      </div>
                    </div>

                    <div style={subListBoxStyle}>
                      <div style={subSectionTitleStyle}>하위 영역 목록</div>

                      {subAreaOptions[area].map((item) => {
                        const selected = subArea === item;

                        return (
                          <div key={item} style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                            <input
                              defaultValue={item}
                              onClick={() => setSubArea(item)}
                              onBlur={(e) => updateSubArea(item, e.target.value)}
                              style={{
                                ...inputStyle,
                                height: "42px",
                                background: selected ? "#E8F3FF" : "white",
                                border: selected ? "1px solid #3182F6" : "1px solid #e5e8eb",
                              }}
                            />

                            <button onClick={() => deleteSubArea(item)} style={deleteButtonStyle}>
                              삭제
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <FormLabel title="메모" />
            <textarea
              style={{ ...inputStyle, height: "120px", resize: "none", paddingTop: "16px" }}
              placeholder="추가로 기억할 내용을 적어주세요."
            />

            <button style={redButtonFull} onClick={saveTodo}>
              {editingTodoId ? "수정하기" : "추가하기"}
            </button>

            {editingTodoId && (
              <button style={deleteFullButtonStyle} onClick={deletePlannerTodo}>
                삭제하기
              </button>
            )}
          </div>
        </div>
      )}

      {isMemoModalOpen && (
        <div style={modalBackdropStyle}>
          <div style={{ ...modalBoxStyle, width: "520px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <h2 style={{ fontSize: "32px", fontWeight: "bold", margin: 0 }}>
                주간 메모 추가
              </h2>

              <button onClick={() => setIsMemoModalOpen(false)} style={closeButtonStyle}>
                ×
              </button>
            </div>

            <FormLabel title="메모" />
            <textarea
              value={memoContent}
              onChange={(e) => setMemoContent(e.target.value)}
              style={{ ...inputStyle, height: "180px", resize: "none", paddingTop: "16px" }}
              placeholder="이번 주 기억할 내용을 적어주세요."
            />

            <button style={redButtonFull} onClick={saveMemo}>
              추가하기
            </button>
          </div>
        </div>
      )}

      {isTodoListOpen && (
        <div style={modalBackdropStyle}>
          <div style={{ ...modalBoxStyle, width: "680px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2 style={{ fontSize: "28px", fontWeight: "bold", margin: 0 }}>To do</h2>
                <p style={{ color: "#8A8178", margin: "8px 0 0", fontSize: "14px" }}>
                  전체 할 일을 한 번에 모아보고 수정할 수 있어요.
                </p>
              </div>
              <button onClick={() => setIsTodoListOpen(false)} style={closeButtonStyle}>
                ×
              </button>
            </div>

            <button
              onClick={() => openTodoModal("memo")}
              style={{ ...todayButtonStyle, marginTop: "18px" }}
            >
              + To do 추가
            </button>

            <div style={todoListGroupWrapStyle}>
              {todos.length === 0 && (
                <div style={{ color: "#8A8178", fontSize: "14px" }}>등록된 To do가 없어요.</div>
              )}
              <TodoListGroup
                title="마감일이 없는"
                todos={undatedTodos}
                toggleDone={toggleDone}
                openTodo={(todo) => {
                  setIsTodoListOpen(false);
                  openEditTodoModal(todo);
                }}
              />
              <TodoListGroup
                title="마감날짜 오름차순"
                todos={datedTodos}
                toggleDone={toggleDone}
                openTodo={(todo) => {
                  setIsTodoListOpen(false);
                  openEditTodoModal(todo);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {isScheduleModalOpen && (
        <div style={modalBackdropStyle}>
          <div style={{ ...modalBoxStyle, width: "520px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <h2 style={{ fontSize: "32px", fontWeight: "bold", margin: 0 }}>
                {editingScheduleId ? "일정 수정" : "일정 추가"}
              </h2>

              <button onClick={() => setIsScheduleModalOpen(false)} style={closeButtonStyle}>
                ×
              </button>
            </div>

            <FormLabel title="일정" />
            <input
              value={scheduleTitle}
              onChange={(e) => setScheduleTitle(e.target.value)}
              onKeyDown={(e) => {
                if (shouldSubmitByEnter(e)) savePlannerSchedule();
              }}
              style={inputStyle}
              placeholder="예: 팀 미팅"
            />

            <FormLabel title="시작 시간" />
            <input
              type="datetime-local"
              value={scheduleStart}
              onChange={(e) => setScheduleStart(e.target.value)}
              style={inputStyle}
            />

            <FormLabel title="종료 시간" />
            <input
              type="datetime-local"
              value={scheduleEnd}
              onChange={(e) => setScheduleEnd(e.target.value)}
              style={inputStyle}
            />

            <button style={redButtonFull} onClick={savePlannerSchedule}>
              {editingScheduleId ? "수정하기" : "추가하기"}
            </button>

            {editingScheduleId && (
              <button style={deleteFullButtonStyle} onClick={deletePlannerSchedule}>
                삭제하기
              </button>
            )}
          </div>
        </div>
      )}
      <nav style={{
        display: "flex",
        position: "fixed" as const,
        bottom: 0,
        left: 0,
        right: 0,
        height: "64px",
        background: "#FFFCF8",
        borderTop: "1px solid #E8E1D8",
        justifyContent: "space-around",
        alignItems: "center",
        zIndex: 50,
      }}
        className="flex md:hidden"
      >
        {[
          { id: "calendar", label: "캘린더", icon: "📅" },
          { id: "planner", label: "플래너", icon: "📋" },
          { id: "project", label: "프로젝트", icon: "🗂️" },
          { id: "record", label: "기록", icon: "📝" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActivePage(tab.id as typeof activePage)}
            style={{
              display: "flex",
              flexDirection: "column" as const,
              alignItems: "center",
              gap: "2px",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "8px 16px",
              color: activePage === tab.id ? "#B40023" : "#8A8178",
              fontWeight: activePage === tab.id ? "800" : "400",
              fontSize: "11px",
            }}
          >
            <span style={{ fontSize: "22px" }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>
    </main>
  );
}
function ProjectPage({
  onCreatePlannerTodo,
  onTrashItem,
}: {
  onCreatePlannerTodo: (project: {
    title: string;
    area: Area;
    subArea: string;
    dueDate: string;
    urgency: number;
    importance: number;
    progress: number;
  }) => void;
  onTrashItem: (item: Omit<TrashItem, "id" | "deletedAt">) => void;
}) {
  const makeProjectTodos = (items: ProjectTodoSeed[]): ProjectTodo[] =>
    items.map((item, index) => {
      const title = typeof item === "string" ? item : item.title;
      const children = typeof item === "string" ? [] : item.children || [];

      return {
        id: createProjectTodoId() + index,
        title,
        done: false,
        children: makeProjectTodos(children),
      };
    });

  const [projects, setProjects] = useState<Project[]>(() => [
    {
      id: 1,
      title: "System Maker 개발",
      desc: "플래너, 캘린더, 프로젝트 센터를 연결하는 나만의 업무 OS",
      area: "일",
      subArea: "사이드",
      dueDate: "",
      urgency: 2,
      importance: 3,
      progress: 65,
      status: "진행중",
      memo: "플래너, 캘린더, 프로젝트 센터를 하나의 흐름으로 연결하기",
      todos: makeProjectTodos([
        { title: "캘린더 UI 정리", children: ["구글 캘린더 연결 확인", "일정 추가 팝업 점검"] },
        "프로젝트 센터 구조 만들기",
        "Firebase 저장 연결",
      ]),
    },
    {
      id: 2,
      title: "브랜드 콘텐츠 기획",
      desc: "System Maker를 소개할 콘텐츠와 런칭 스토리 정리",
      area: "일",
      subArea: "사이드",
      dueDate: "",
      urgency: 1,
      importance: 2,
      progress: 35,
      status: "기획중",
      memo: "런칭 전 소개 콘텐츠와 메시지 정리",
      todos: makeProjectTodos(["브랜드 문장 정리", "인스타 콘텐츠 초안", "소개 페이지 구성"]),
    },
    {
      id: 3,
      title: "웨딩 준비",
      desc: "개인 일정과 준비할 일을 프로젝트처럼 관리",
      area: "일상",
      subArea: "그외",
      dueDate: "",
      urgency: 2,
      importance: 2,
      progress: 45,
      status: "진행중",
      memo: "개인 준비 일정과 체크리스트 관리",
      todos: makeProjectTodos(["업체 비교", "예산표 정리", "촬영 준비물 체크"]),
    },
  ]);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [projectTitle, setProjectTitle] = useState("");
  const [projectDesc, setProjectDesc] = useState("");
  const [projectArea, setProjectArea] = useState<Area>("일");
  const [projectSubArea, setProjectSubArea] = useState("본업");
  const [projectNewSubArea, setProjectNewSubArea] = useState("");
  const [isProjectSubAreaOpen, setIsProjectSubAreaOpen] = useState(false);
  const [projectDueDate, setProjectDueDate] = useState("");
  const [projectUrgency, setProjectUrgency] = useState(0);
  const [projectImportance, setProjectImportance] = useState(0);
  const [projectStatus, setProjectStatus] = useState("기획중");
  const [projectProgress, setProjectProgress] = useState(0);
  const [projectMemo, setProjectMemo] = useState("");
  const [projectDraftTodos, setProjectDraftTodos] = useState<ProjectTodo[]>([]);
  const [newTodoTitles, setNewTodoTitles] = useState<Record<number, string>>({});
  const [newChildTodoTitles, setNewChildTodoTitles] = useState<Record<string, string>>({});
  const [newDraftTodoTitle, setNewDraftTodoTitle] = useState("");
  const [newDraftChildTitles, setNewDraftChildTitles] = useState<Record<number, string>>({});
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [projectSubAreaOptions, setProjectSubAreaOptions] = useState<Record<Area, string[]>>({
    일: ["본업", "사이드"],
    관리: ["공부", "뷰티", "건강", "경제"],
    일상: ["가족", "관계", "그외"],
  });
  const statusOrder: Record<string, number> = {
    진행중: 0,
    기획중: 1,
    보류: 2,
    완료: 3,
  };

  const countTodos = (todos: ProjectTodo[]): { total: number; remaining: number } =>
    todos.reduce(
      (count, todo) => {
        const childCount = countTodos(todo.children);
        return {
          total: count.total + 1 + childCount.total,
          remaining: count.remaining + (todo.done ? 0 : 1) + childCount.remaining,
        };
      },
      { total: 0, remaining: 0 }
    );

  const updateTodoTree = (
    todos: ProjectTodo[],
    todoId: number,
    updater: (todo: ProjectTodo) => ProjectTodo
  ): ProjectTodo[] =>
    todos.map((todo) =>
      todo.id === todoId
        ? updater(todo)
        : { ...todo, children: updateTodoTree(todo.children, todoId, updater) }
    );

  const deleteTodoFromTree = (todos: ProjectTodo[], todoId: number): ProjectTodo[] =>
    todos
      .filter((todo) => todo.id !== todoId)
      .map((todo) => ({ ...todo, children: deleteTodoFromTree(todo.children, todoId) }));

  const updateProject = (projectId: number, updater: (project: Project) => Project) => {
    setProjects(projects.map((project) => (project.id === projectId ? updater(project) : project)));
  };

  const sortedProjects = [...projects].sort((a, b) => {
    const titleCompare = a.title.localeCompare(b.title, "ko-KR");
    if (titleCompare !== 0) return titleCompare;

    const statusCompare = (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
    if (statusCompare !== 0) return statusCompare;

    return b.progress - a.progress;
  });

  const selectedProject = projects.find((project) => project.id === selectedProjectId);

  const addProjectSubArea = () => {
    const clean = projectNewSubArea.trim();
    if (!clean) return;

    if (!projectSubAreaOptions[projectArea].includes(clean)) {
      setProjectSubAreaOptions({
        ...projectSubAreaOptions,
        [projectArea]: [...projectSubAreaOptions[projectArea], clean],
      });
    }

    setProjectSubArea(clean);
    setProjectNewSubArea("");
  };

  const saveProject = () => {
    if (!projectTitle.trim()) return;

    const newProject = {
      id: editingProjectId || createProjectTodoId(),
      title: projectTitle.trim(),
      desc: projectDesc.trim() || "설명이 아직 없어요.",
      area: projectArea,
      subArea: projectSubArea,
      dueDate: projectDueDate,
      urgency: projectUrgency,
      importance: projectImportance,
      progress: projectProgress,
      status: projectStatus,
      memo: projectMemo.trim(),
      todos: projectDraftTodos,
    };

    setProjects(
      editingProjectId
        ? projects.map((project) => (project.id === editingProjectId ? newProject : project))
        : [...projects, newProject]
    );
    if (!editingProjectId) {
      onCreatePlannerTodo({
        title: newProject.title,
        area: newProject.area,
        subArea: newProject.subArea,
        dueDate: newProject.dueDate,
        urgency: newProject.urgency,
        importance: newProject.importance,
        progress: newProject.progress,
      });
    }
    setSelectedProjectId(newProject.id);

    setProjectTitle("");
    setProjectDesc("");
    setProjectArea("일");
    setProjectSubArea("본업");
    setProjectNewSubArea("");
    setIsProjectSubAreaOpen(false);
    setProjectDueDate("");
    setProjectUrgency(0);
    setProjectImportance(0);
    setProjectStatus("기획중");
    setProjectProgress(0);
    setProjectMemo("");
    setProjectDraftTodos([]);
    setNewDraftTodoTitle("");
    setNewDraftChildTitles({});
    setEditingProjectId(null);
    setIsProjectModalOpen(false);
  };

  const openEditProject = (project: Project) => {
    setEditingProjectId(project.id);
    setProjectTitle(project.title);
    setProjectDesc(project.desc);
    setProjectArea(project.area);
    setProjectSubArea(project.subArea);
    setProjectDueDate(project.dueDate);
    setProjectUrgency(project.urgency);
    setProjectImportance(project.importance);
    setProjectStatus(project.status);
    setProjectProgress(project.progress);
    setProjectMemo(project.memo);
    setProjectDraftTodos(project.todos);
    setIsProjectModalOpen(true);
  };

  const deleteProject = (projectId: number) => {
    const targetProject = projects.find((project) => project.id === projectId);
    if (!targetProject || !window.confirm("정말 삭제하시겠습니까?")) return;

    setProjects(projects.filter((project) => project.id !== projectId));
    setSelectedProjectId(null);
    onTrashItem({
      section: "프로젝트 센터",
      title: targetProject.title,
      restore: () => setProjects((currentProjects) => [...currentProjects, targetProject]),
    });
  };

  const addProjectTodo = (projectId: number) => {
    const title = (newTodoTitles[projectId] || "").trim();
    if (!title) return;

    updateProject(projectId, (project) => ({
      ...project,
      todos: [...project.todos, { id: createProjectTodoId(), title, done: false, children: [] }],
    }));
    setNewTodoTitles({ ...newTodoTitles, [projectId]: "" });
  };

  const updateProjectTodo = (
    projectId: number,
    todoId: number,
    updater: (todo: ProjectTodo) => ProjectTodo
  ) => {
    updateProject(projectId, (project) => ({
      ...project,
      todos: updateTodoTree(project.todos, todoId, updater),
    }));
  };

  const deleteProjectTodo = (projectId: number, todoId: number) => {
    const project = projects.find((item) => item.id === projectId);
    const findTodo = (todos: ProjectTodo[]): ProjectTodo | undefined => {
      for (const todo of todos) {
        if (todo.id === todoId) return todo;
        const childTodo = findTodo(todo.children);
        if (childTodo) return childTodo;
      }
      return undefined;
    };
    const targetTodo = project ? findTodo(project.todos) : undefined;
    if (!targetTodo || !window.confirm("정말 삭제하시겠습니까?")) return;

    updateProject(projectId, (project) => ({
      ...project,
      todos: deleteTodoFromTree(project.todos, todoId),
    }));
    onTrashItem({
      section: "프로젝트 센터",
      title: targetTodo.title,
      restore: () =>
        setProjects((currentProjects) =>
          currentProjects.map((currentProject) =>
            currentProject.id === projectId
              ? { ...currentProject, todos: [...currentProject.todos, targetTodo] }
              : currentProject
          )
        ),
    });
  };

  const addChildTodo = (projectId: number, todoId: number) => {
    const key = `${projectId}-${todoId}`;
    const title = (newChildTodoTitles[key] || "").trim();
    if (!title) return;

    updateProjectTodo(projectId, todoId, (todo) => ({
      ...todo,
      children: [...todo.children, { id: createProjectTodoId(), title, done: false, children: [] }],
    }));
    setNewChildTodoTitles({ ...newChildTodoTitles, [key]: "" });
  };

  const addDraftTodo = () => {
    const title = newDraftTodoTitle.trim();
    if (!title) return;

    setProjectDraftTodos([
      ...projectDraftTodos,
      { id: createProjectTodoId(), title, done: false, children: [] },
    ]);
    setNewDraftTodoTitle("");
  };

  const addDraftChildTodo = (todoId: number) => {
    const title = (newDraftChildTitles[todoId] || "").trim();
    if (!title) return;

    setProjectDraftTodos(
      updateTodoTree(projectDraftTodos, todoId, (todo) => ({
        ...todo,
        children: [...todo.children, { id: createProjectTodoId(), title, done: false, children: [] }],
      }))
    );
    setNewDraftChildTitles({ ...newDraftChildTitles, [todoId]: "" });
  };

  if (selectedProject) {
    const todoCount = countTodos(selectedProject.todos);

    return (
      <div style={modalBackdropStyle}>
        <div style={projectDetailModalStyle}>
        <div style={pageHeaderStyle}>
          <div>
            <button
              onClick={() => setSelectedProjectId(null)}
              style={{ ...todayButtonStyle, marginBottom: "16px" }}
            >
              {"<"} 프로젝트 목록
            </button>

            <h2 style={{ fontSize: "36px", fontWeight: "bold", marginBottom: "8px" }}>
              {selectedProject.title}
            </h2>

            <p style={{ color: "#8A8178", margin: 0 }}>{selectedProject.desc}</p>
            {selectedProject.dueDate && (
              <p style={{ color: "#B40023", margin: "10px 0 0", fontSize: "14px", fontWeight: "bold" }}>
                마감일 {selectedProject.dueDate}
              </p>
            )}
          </div>

          <div style={projectDetailMetaStyle}>
            <button onClick={() => openEditProject(selectedProject)} style={todayButtonStyle}>
              수정
            </button>
            <button onClick={() => deleteProject(selectedProject.id)} style={smallDangerButtonStyle}>
              삭제
            </button>
            <button onClick={() => setSelectedProjectId(null)} style={closeButtonStyle}>
              ×
            </button>
            <span style={projectStatusBadgeStyle}>{selectedProject.status}</span>
            <div style={projectProgressTextStyle}>{selectedProject.progress}%</div>
            <div style={projectTodoCountStyle}>
              {todoCount.total - todoCount.remaining} / {todoCount.total} 진행
            </div>
          </div>
        </div>

        <div style={projectSummaryGridStyle}>
          <div style={projectSummaryItemStyle}>
            <span style={projectSummaryLabelStyle}>영역</span>
            <strong>{selectedProject.area} / {selectedProject.subArea}</strong>
          </div>
          <div style={projectSummaryItemStyle}>
            <span style={projectSummaryLabelStyle}>상태</span>
            <strong>{selectedProject.status}</strong>
          </div>
          <div style={projectSummaryItemStyle}>
            <span style={projectSummaryLabelStyle}>긴급도</span>
            <strong>{"★".repeat(selectedProject.urgency) || "없음"}</strong>
          </div>
          <div style={projectSummaryItemStyle}>
            <span style={projectSummaryLabelStyle}>중요도</span>
            <strong>{"★".repeat(selectedProject.importance) || "없음"}</strong>
          </div>
          {selectedProject.memo && (
            <div style={{ ...projectSummaryItemStyle, gridColumn: "1 / -1" }}>
              <span style={projectSummaryLabelStyle}>메모</span>
              <strong>{selectedProject.memo}</strong>
            </div>
          )}
        </div>

        <div style={projectDetailPanelStyle}>
          <div style={projectProgressTrackStyle}>
            <div style={{ ...projectProgressFillStyle, width: `${selectedProject.progress}%` }} />
          </div>

          <h3 style={{ fontSize: "22px", margin: "28px 0 16px" }}>To do</h3>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {selectedProject.todos.length === 0 && (
              <div style={{ color: "#8A8178", fontSize: "14px" }}>
                아직 등록된 할 일이 없어요.
              </div>
            )}

            <div style={projectTodoAddBoxStyle}>
              <input
                value={newTodoTitles[selectedProject.id] || ""}
                onChange={(e) =>
                  setNewTodoTitles({ ...newTodoTitles, [selectedProject.id]: e.target.value })
                }
                onKeyDown={(e) => {
                  if (shouldSubmitByEnter(e)) addProjectTodo(selectedProject.id);
                }}
                style={projectTodoInputStyle}
                placeholder="새 To do 추가"
              />

              <button onClick={() => addProjectTodo(selectedProject.id)} style={subButtonSmall}>
                추가
              </button>
            </div>

            {selectedProject.todos.map((todo) => (
                <ProjectTodoItem
                  key={todo.id}
                  todo={todo}
                  depth={0}
                  onUpdate={(todoId, updater) => updateProjectTodo(selectedProject.id, todoId, updater)}
                onDelete={(todoId) => deleteProjectTodo(selectedProject.id, todoId)}
                getNewChildTitle={(todoId) => newChildTodoTitles[`${selectedProject.id}-${todoId}`] || ""}
                setNewChildTitle={(todoId, value) =>
                  setNewChildTodoTitles({
                    ...newChildTodoTitles,
                    [`${selectedProject.id}-${todoId}`]: value,
                  })
                }
                addChild={(todoId) => addChildTodo(selectedProject.id, todoId)}
              />
            ))}

          </div>
        </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={pageHeaderStyle}>
        <div>
          <h2 style={{ fontSize: "clamp(20px, 5vw, 36px)", fontWeight: "bold", marginBottom: "8px", whiteSpace: "nowrap" }}>
            프로젝트 센터
          </h2>

          <p style={{ color: "#8A8178", margin: 0 }}>
            큰 목표를 프로젝트 단위로 관리해요.
          </p>
        </div>

        <button onClick={() => setIsProjectModalOpen(true)} style={todayButtonStyle}>
          + 프로젝트 추가
        </button>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "24px",
        }}
      >
        <div
          style={{
            background: "#FFFCF8",
            border: "1px solid #E8E1D8",
            borderRadius: "28px",
            padding: "28px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {sortedProjects.map((project) => {
              const todoCount = countTodos(project.todos);
              return (
                <button
                  key={project.id}
                  onClick={() => setSelectedProjectId(project.id)}
                  style={projectListItemStyle}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                      <div style={{ fontSize: "18px", fontWeight: "bold" }}>{project.title}</div>
                      <span style={projectAreaBadgeStyle}>
                        {project.area} / {project.subArea}
                      </span>
                      <span style={projectStatusBadgeStyle}>{project.status}</span>
                    </div>

                    <p style={{ color: "#8A8178", fontSize: "14px", margin: "8px 0 14px" }}>
                      {project.desc}
                    </p>

                    {project.dueDate && (
                      <div style={projectDueDateTextStyle}>마감일 {project.dueDate}</div>
                    )}

                    <div style={projectProgressTrackStyle}>
                      <div style={{ ...projectProgressFillStyle, width: `${project.progress}%` }} />
                    </div>
                  </div>

                  <div style={projectMetaColumnStyle}>
                    <div style={projectProgressTextStyle}>{project.progress}%</div>
                    <div style={projectTodoCountStyle}>
                      {todoCount.total - todoCount.remaining} / {todoCount.total} 진행
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

      </div>

      {isProjectModalOpen && (
        <div style={modalBackdropStyle}>
          <div style={{ ...modalBoxStyle, width: "620px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <h2 style={{ fontSize: "32px", fontWeight: "bold", margin: 0 }}>
                  {editingProjectId ? "프로젝트 수정" : "프로젝트 추가"}
                </h2>
                <p style={{ color: "#6b7280", marginTop: "12px" }}>
                  목표, 상태, 진행률, 첫 할 일을 함께 등록해요.
                </p>
              </div>

              <button onClick={() => setIsProjectModalOpen(false)} style={closeButtonStyle}>
                ×
              </button>
            </div>

            <FormLabel title="프로젝트 이름" />
            <input
              value={projectTitle}
              onChange={(e) => setProjectTitle(e.target.value)}
              style={inputStyle}
              placeholder="예: 6월 런칭 준비"
            />

            <FormLabel title="설명" />
            <textarea
              value={projectDesc}
              onChange={(e) => setProjectDesc(e.target.value)}
              style={{ ...inputStyle, height: "110px", resize: "none", paddingTop: "16px" }}
              placeholder="프로젝트의 목적이나 관리 기준을 적어주세요."
            />

            <div style={twoColumnStyle}>
              <div>
                <FormLabel title="영역" />
                <div style={{ position: "relative" }}>
                  <select
                    style={selectStyle}
                    value={projectArea}
                    onChange={(e) => {
                      const selectedArea = e.target.value as Area;
                      setProjectArea(selectedArea);
                      setProjectSubArea(projectSubAreaOptions[selectedArea][0] || "");
                      setIsProjectSubAreaOpen(false);
                    }}
                  >
                    <option>일</option>
                    <option>관리</option>
                    <option>일상</option>
                  </select>

                  <span style={selectArrowStyle}>⌄</span>
                </div>
              </div>

              <div style={{ position: "relative" }}>
                <FormLabel title="하위 영역" />
                <button
                  onClick={() => setIsProjectSubAreaOpen(!isProjectSubAreaOpen)}
                  style={subAreaSelectButtonStyle}
                >
                  <span>{projectSubArea || "하위 영역 선택"}</span>
                  <span style={selectArrowStyle}>⌄</span>
                </button>

                {isProjectSubAreaOpen && (
                  <div style={subDropdownStyle}>
                    <div style={subAddBoxStyle}>
                      <div style={subSectionTitleStyle}>새 하위 영역 추가</div>

                      <div style={{ display: "flex", gap: "8px" }}>
                        <input
                          value={projectNewSubArea}
                          onChange={(e) => setProjectNewSubArea(e.target.value)}
                          onKeyDown={(e) => {
                            if (shouldSubmitByEnter(e)) addProjectSubArea();
                          }}
                          placeholder="예: 콘텐츠"
                          style={{ ...inputStyle, height: "44px", background: "#FFFDF9" }}
                        />
                        <button
                          style={{ ...subButtonSmall, height: "44px" }}
                          onClick={addProjectSubArea}
                        >
                          추가
                        </button>
                      </div>
                    </div>

                    <div style={subListBoxStyle}>
                      <div style={subSectionTitleStyle}>하위 영역 목록</div>

                      {projectSubAreaOptions[projectArea].map((item) => {
                        const selected = projectSubArea === item;

                        return (
                          <button
                            key={item}
                            onClick={() => {
                              setProjectSubArea(item);
                              setIsProjectSubAreaOpen(false);
                            }}
                            style={{
                              ...projectSubAreaOptionStyle,
                              background: selected ? "#E8F3FF" : "white",
                              border: selected ? "1px solid #3182F6" : "1px solid #e5e8eb",
                            }}
                          >
                            {item}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div style={twoColumnStyle}>
              <div>
                <FormLabel title="상태" />
                <div style={{ position: "relative" }}>
                  <select
                    value={projectStatus}
                    onChange={(e) => setProjectStatus(e.target.value)}
                    style={selectStyle}
                  >
                    <option>기획중</option>
                    <option>진행중</option>
                    <option>보류</option>
                    <option>완료</option>
                  </select>
                  <span style={selectArrowStyle}>⌄</span>
                </div>
              </div>

              <div>
                <FormLabel title="마감일" />
                <input
                  type="date"
                  value={projectDueDate}
                  onChange={(e) => setProjectDueDate(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={splitRowStyle}>
              <div style={halfBlockStyle}>
                <div style={{ flex: 1 }}>
                  <FormLabel title="긴급도" />
                  <StarPicker value={projectUrgency} onChange={setProjectUrgency} />
                </div>

                <div style={{ flex: 1 }}>
                  <FormLabel title="중요도" />
                  <StarPicker value={projectImportance} onChange={setProjectImportance} />
                </div>
              </div>

              <div style={halfBlockStyle}>
                <div style={{ width: "100%" }}>
                  <FormLabel title="진행률" />
                  <ProgressBarInput value={projectProgress} onChange={setProjectProgress} />
                </div>
              </div>
            </div>

            <FormLabel title="메모" />
            <textarea
              value={projectMemo}
              onChange={(e) => setProjectMemo(e.target.value)}
              style={{ ...inputStyle, height: "120px", resize: "none", paddingTop: "16px" }}
              placeholder="추가로 기억할 내용을 적어주세요."
            />

            <FormLabel title="프로젝트 To do" />
            <div style={projectDraftTodoPanelStyle}>
              {projectDraftTodos.map((todo) => (
                <ProjectTodoItem
                  key={todo.id}
                  todo={todo}
                  depth={0}
                  onUpdate={(todoId, updater) =>
                    setProjectDraftTodos(updateTodoTree(projectDraftTodos, todoId, updater))
                  }
                  onDelete={(todoId) => {
                    if (window.confirm("정말 삭제하시겠습니까?")) {
                      setProjectDraftTodos(deleteTodoFromTree(projectDraftTodos, todoId));
                    }
                  }}
                  getNewChildTitle={(todoId) => newDraftChildTitles[todoId] || ""}
                  setNewChildTitle={(todoId, value) =>
                    setNewDraftChildTitles({ ...newDraftChildTitles, [todoId]: value })
                  }
                  addChild={addDraftChildTodo}
                />
              ))}

              <div style={projectTodoAddBoxStyle}>
                <input
                  value={newDraftTodoTitle}
                  onChange={(e) => setNewDraftTodoTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (shouldSubmitByEnter(e)) addDraftTodo();
                  }}
                  style={projectTodoInputStyle}
                  placeholder="To do를 하나씩 입력"
                />

                <button onClick={addDraftTodo} style={subButtonSmall}>
                  추가
                </button>
              </div>
            </div>

            <button style={redButtonFull} onClick={saveProject}>
              {editingProjectId ? "수정하기" : "추가하기"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectTodoItem({
  todo,
  depth = 0,
  onUpdate,
  onDelete,
  getNewChildTitle,
  setNewChildTitle,
  addChild,
}: {
  todo: ProjectTodo;
  depth?: number;
  onUpdate: (todoId: number, updater: (todo: ProjectTodo) => ProjectTodo) => void;
  onDelete: (todoId: number) => void;
  getNewChildTitle: (todoId: number) => string;
  setNewChildTitle: (todoId: number, value: string) => void;
  addChild: (todoId: number) => void;
}) {
  const [isChildInputOpen, setIsChildInputOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const childTitle = getNewChildTitle(todo.id);
  const submitChildTodo = () => {
    if (!childTitle.trim()) return;

    addChild(todo.id);
    setIsChildInputOpen(false);
  };

  return (
    <div
      style={{
        ...projectTodoBoxStyle,
        ...(depth > 0 ? projectSubTodoBoxStyle : {}),
      }}
    >
      <div
        style={{
          ...projectTodoRowStyle,
          gridTemplateColumns: depth > 0 ? "20px 30px 30px 22px 1fr 52px" : "30px 30px 22px 1fr 52px",
        }}
      >
        {depth > 0 && <div style={projectSubTodoMarkerStyle}>ㄴ</div>}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          style={{
            ...projectTodoCollapseButtonStyle,
            transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
          }}
          title={isCollapsed ? "펼치기" : "접기"}
        >
          v
        </button>
        <button
          onClick={() => setIsChildInputOpen(true)}
          style={projectTodoCollapseButtonStyle}
          title="하위 To do 추가"
        >
          +
        </button>
        <input
          type="checkbox"
          checked={todo.done}
          onChange={() => onUpdate(todo.id, (currentTodo) => ({ ...currentTodo, done: !currentTodo.done }))}
          style={{ width: "18px", height: "18px", accentColor: "#B40023" }}
        />

        <input
          value={todo.title}
          onChange={(e) => onUpdate(todo.id, (currentTodo) => ({ ...currentTodo, title: e.target.value }))}
          style={{
            ...projectTodoInputStyle,
            textDecoration: todo.done ? "line-through" : "none",
            color: todo.done ? "#8A8178" : "#191f28",
            fontWeight: depth === 0 ? "800" : "500",
          }}
        />

        <button onClick={() => onDelete(todo.id)} style={smallDangerButtonStyle}>
          삭제
        </button>
      </div>

      {!isCollapsed && <div style={subTodoListStyle}>
        {todo.children.map((childTodo) => (
          <ProjectTodoItem
            key={childTodo.id}
            todo={childTodo}
            depth={depth + 1}
            onUpdate={onUpdate}
            onDelete={onDelete}
            getNewChildTitle={getNewChildTitle}
            setNewChildTitle={setNewChildTitle}
            addChild={addChild}
          />
        ))}

        {isChildInputOpen && (
          <div style={subTodoAddRowStyle}>
            <input
              value={childTitle}
              onChange={(e) => setNewChildTitle(todo.id, e.target.value)}
              onKeyDown={(e) => {
                if (shouldSubmitByEnter(e)) submitChildTodo();
              }}
              style={projectSubTodoInputStyle}
              placeholder="하위 To do 입력"
              autoFocus
            />

            <button onClick={submitChildTodo} style={smallGhostButtonStyle}>
              추가
            </button>
          </div>
        )}
      </div>}
    </div>
  );
}

function RecordPage({
  linkedCategories,
  onTrashItem,
}: {
  linkedCategories: Record<Area, string[]>;
  onTrashItem: (item: Omit<TrashItem, "id" | "deletedAt">) => void;
}) {
  const [records, setRecords] = useState<RecordSection[]>(() =>
    createLinkedRecordSections(linkedCategories)
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<number | null>(null);
  const [recordTitle, setRecordTitle] = useState("");
  const [recordDesc, setRecordDesc] = useState("");
  const [recordItems, setRecordItems] = useState<string[]>([]);
  const [newRecordItem, setNewRecordItem] = useState("");
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);
  const [selectedRecordItem, setSelectedRecordItem] = useState("");
  const [recordMemoTitle, setRecordMemoTitle] = useState("");
  const [recordMemoContent, setRecordMemoContent] = useState("");
  const [recordMemoSource, setRecordMemoSource] = useState("");
  const [recordMemoSearch, setRecordMemoSearch] = useState("");
  const [recordMemoFilter, setRecordMemoFilter] = useState("");
  const [isRecordMemoModalOpen, setIsRecordMemoModalOpen] = useState(false);
  const [editingRecordMemoId, setEditingRecordMemoId] = useState<number | null>(null);
  const [recordCategoryColors, setRecordCategoryColors] = useState<Record<string, string>>({});
  const [recordSubCategoryColors, setRecordSubCategoryColors] = useState<Record<string, string>>({});
  const currentRecordMemoCreatedAt = new Date().toLocaleString("ko-KR");
  const syncedRecords = syncRecordSections(records, linkedCategories);
  const getRecordCategoryColor = (record: RecordSection) =>
    recordCategoryColors[record.title] || getPaletteColor(record.title, record.id);
  const getRecordSubCategoryColor = (record: RecordSection, item: string) =>
    recordSubCategoryColors[`${record.title}-${item}`] || getPaletteColor(`${record.title}-${item}`, record.id + item.length);

  const resetRecordForm = () => {
    setEditingRecordId(null);
    setRecordTitle("");
    setRecordDesc("");
    setRecordItems([]);
    setNewRecordItem("");
  };

  const openEditRecord = (record: RecordSection) => {
    setEditingRecordId(record.id);
    setRecordTitle(record.title);
    setRecordDesc(record.desc);
    setRecordItems(record.items);
    setNewRecordItem("");
  };

  const addRecordItem = () => {
    const clean = newRecordItem.trim();
    if (!clean) return;

    setRecordItems([...recordItems, clean]);
    setNewRecordItem("");
  };

  const updateRecordItem = (index: number, value: string) => {
    setRecordItems(recordItems.map((item, itemIndex) => (itemIndex === index ? value : item)));
  };

  const deleteRecordItem = (index: number) => {
    setRecordItems(recordItems.filter((_, itemIndex) => itemIndex !== index));
  };

  const saveRecord = () => {
    if (!recordTitle.trim()) return;

    const previousItems = editingRecordId
      ? syncedRecords.find((record) => record.id === editingRecordId)?.items || []
      : [];
    const nextItems = recordItems.map((item) => item.trim()).filter(Boolean);
    const previousMemos = editingRecordId
      ? syncedRecords.find((record) => record.id === editingRecordId)?.memos || []
      : [];
    const nextRecordId = editingRecordId || Math.max(0, ...syncedRecords.map((record) => record.id)) + 1;

    const nextRecord = {
      id: nextRecordId,
      title: recordTitle.trim(),
      desc: recordDesc.trim() || "설명이 아직 없어요.",
      items: nextItems,
      memos: previousMemos
        .map((memo) => {
          const previousIndex = previousItems.indexOf(memo.subCategory);
          if (previousIndex === -1 || !nextItems[previousIndex]) return memo;
          return { ...memo, subCategory: nextItems[previousIndex] };
        })
        .filter((memo) => nextItems.includes(memo.subCategory)),
    };

    if (editingRecordId) {
      setRecords(records.map((record) => (record.id === editingRecordId ? nextRecord : record)));
    } else {
      setRecords([...records, nextRecord]);
    }

    resetRecordForm();
  };

  const deleteRecord = (recordId: number) => {
    setRecords(records.filter((record) => record.id !== recordId));
    if (editingRecordId === recordId) resetRecordForm();
    if (selectedRecordId === recordId) setSelectedRecordId(null);
    if (selectedRecordId === recordId) setSelectedRecordItem("");
  };

  const isAllRecordsView = selectedRecordId === null;
  const selectedRecord = syncedRecords.find((record) => record.id === selectedRecordId) || syncedRecords[0];
  const filterRecordMemos = (memos: RecordMemo[], subCategory?: string) => {
    const searchText = recordMemoSearch.trim().toLowerCase();

    return memos
      .filter((memo) => {
        const matchesSubCategory = subCategory
          ? memo.subCategory === subCategory
          : !recordMemoFilter || memo.subCategory === recordMemoFilter;
        const matchesSearch =
          !searchText ||
          [memo.title, memo.content, memo.source || "", memo.subCategory].some((value) =>
            value.toLowerCase().includes(searchText)
          );

        return matchesSubCategory && matchesSearch;
      })
      .sort((a, b) => b.createdAtMs - a.createdAtMs);
  };
  const selectedRecordMemos = selectedRecord
    ? filterRecordMemos(selectedRecord.memos, selectedRecordItem)
    : [];
  const visibleRecordMemoRows = (isAllRecordsView ? syncedRecords : [selectedRecord])
    .flatMap((record) =>
      filterRecordMemos(record.memos).map((memo) => ({
        memo,
        record,
      }))
    )
    .sort((a, b) => b.memo.createdAtMs - a.memo.createdAtMs);
  const totalRecordMemoCount = syncedRecords.reduce((count, record) => count + record.memos.length, 0);

  const saveRecordMemo = () => {
    if (!selectedRecord || !selectedRecordItem || !recordMemoTitle.trim() || !recordMemoContent.trim()) return;

    const createdAtMs = Date.now();

    setRecords(
      records.map((record) =>
        record.id === selectedRecord.id
          ? {
              ...record,
              memos: editingRecordMemoId
                ? record.memos.map((memo) =>
                    memo.id === editingRecordMemoId
                      ? {
                          ...memo,
                          title: recordMemoTitle.trim(),
                          content: recordMemoContent.trim(),
                          source: recordMemoSource.trim(),
                          subCategory: selectedRecordItem,
                        }
                      : memo
                  )
                : [
                    {
                      id: createdAtMs,
                      title: recordMemoTitle.trim(),
                      content: recordMemoContent.trim(),
                      createdAt: new Date(createdAtMs).toLocaleString("ko-KR"),
                      createdAtMs,
                      source: recordMemoSource.trim(),
                      subCategory: selectedRecordItem,
                    },
                    ...record.memos,
                  ],
            }
          : record
      )
    );
    setRecordMemoTitle("");
    setRecordMemoContent("");
    setRecordMemoSource("");
    setEditingRecordMemoId(null);
    setIsRecordMemoModalOpen(false);
  };

  const deleteRecordMemo = (recordId: number, memoId: number) => {
    const targetRecord = records.find((record) => record.id === recordId);
    const targetMemo = targetRecord?.memos.find((memo) => memo.id === memoId);
    if (!targetRecord || !targetMemo || !window.confirm("정말 삭제하시겠습니까?")) return;

    setRecords(
      records.map((record) =>
        record.id === recordId
          ? { ...record, memos: record.memos.filter((memo) => memo.id !== memoId) }
          : record
      )
    );
    onTrashItem({
      section: "기록 센터",
      title: targetMemo.title,
      restore: () =>
        setRecords((currentRecords) =>
          currentRecords.map((record) =>
            record.id === recordId ? { ...record, memos: [targetMemo, ...record.memos] } : record
          )
        ),
    });
  };

  const openQuickRecordMemo = () => {
    const targetRecord = isAllRecordsView ? syncedRecords[0] : selectedRecord;
    const targetItem = selectedRecordItem || targetRecord.items[0];
    if (!targetItem) return;

    setSelectedRecordId(targetRecord.id);
    setSelectedRecordItem(targetItem);
    setRecordMemoFilter(targetItem);
    setRecordMemoTitle("");
    setRecordMemoContent("");
    setRecordMemoSource("");
    setEditingRecordMemoId(null);
    setIsRecordMemoModalOpen(true);
  };

  const openExistingRecordMemo = (record: RecordSection, memo: RecordMemo) => {
    setSelectedRecordId(record.id);
    setSelectedRecordItem(memo.subCategory);
    setRecordMemoFilter(memo.subCategory);
    setEditingRecordMemoId(memo.id);
    setRecordMemoTitle(memo.title);
    setRecordMemoContent(memo.content);
    setRecordMemoSource(memo.source || "");
    setIsRecordMemoModalOpen(true);
  };

  const deleteEditingRecordMemo = () => {
    if (!editingRecordMemoId || !selectedRecord) return;
    deleteRecordMemo(selectedRecord.id, editingRecordMemoId);
    setEditingRecordMemoId(null);
    setIsRecordMemoModalOpen(false);
  };

  return (
    <div>
      <div style={pageHeaderStyle}>
        <div>
          <h2 style={{ fontSize: "clamp(20px, 5vw, 36px)", fontWeight: "bold", marginBottom: "8px", whiteSpace: "nowrap" }}>
            기록 센터
          </h2>

          <p style={{ color: "#8A8178", margin: 0 }}>
            일과 프로젝트의 흔적을 모아두는 공간이에요.
          </p>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={openQuickRecordMemo}
            style={plannerQuickAddButtonStyle}
            title="메모 추가"
            aria-label="메모 추가"
          >
            +
          </button>
          <button
            onClick={() => setIsSettingsOpen(true)}
            style={iconButtonStyle}
            title="기록 센터 설정"
            aria-label="기록 센터 설정"
          >
            <Settings size={20} />
          </button>
        </div>
      </div>

      <div style={recordCenterShellStyle}>
        <div style={recordChoicePanelStyle}>
          <div style={recordChoiceLabelStyle}>카테고리</div>
          <div style={recordThinButtonRowStyle}>
            <button
              onClick={() => {
                setSelectedRecordId(null);
                setSelectedRecordItem("");
                setRecordMemoFilter("");
              }}
              style={{
                ...recordThinButtonStyle,
                ...(isAllRecordsView ? recordThinButtonActiveStyle : {}),
              }}
            >
              <span>전체 보기</span>
              <span>{totalRecordMemoCount}</span>
            </button>
            {syncedRecords.map((record) => {
              const isActive = !isAllRecordsView && selectedRecord.id === record.id;
              const categoryColor = getRecordCategoryColor(record);

              return (
                <button
                  key={record.id}
                  onClick={() => {
                    setSelectedRecordId(record.id);
                    setSelectedRecordItem("");
                    setRecordMemoFilter("");
                  }}
                  style={{
                    ...recordThinButtonStyle,
                    border: `1px solid ${categoryColor}`,
                    background: isActive ? categoryColor : "#FFFCF8",
                    color: isActive ? "#FFFFFF" : categoryColor,
                  }}
                >
                  <span>{record.title}</span>
                  <span>{record.memos.length}</span>
                </button>
              );
            })}
          </div>

          <div style={recordSubChoiceLabelStyle}>ㄴ 하위 카테고리</div>
          <div style={recordThinButtonRowStyle}>
            {isAllRecordsView ? (
              <div style={recordAllHintStyle}>카테고리를 선택하면 하위 카테고리별로 메모를 작성할 수 있어요.</div>
            ) : selectedRecord.items.map((item) => {
              const memoCount = selectedRecord.memos.filter((memo) => memo.subCategory === item).length;
              const isActive = selectedRecordItem === item;
              const subCategoryColor = getRecordSubCategoryColor(selectedRecord, item);

              return (
                <button
                  key={item}
                  onClick={() => {
                    setSelectedRecordItem(item);
                    setRecordMemoFilter(item);
                  }}
                  onDoubleClick={() => {
                    setSelectedRecordItem(item);
                    setRecordMemoFilter(item);
                    setRecordMemoTitle("");
                    setRecordMemoContent("");
                    setRecordMemoSource("");
                    setEditingRecordMemoId(null);
                    setIsRecordMemoModalOpen(true);
                  }}
                  style={{
                    ...recordThinButtonStyle,
                    ...recordSubThinButtonStyle,
                    border: `1px solid ${subCategoryColor}`,
                    background: isActive ? subCategoryColor : "#FFFCF8",
                    color: isActive ? "#FFFFFF" : subCategoryColor,
                  }}
                >
                  <span>{item}</span>
                  <span>{memoCount}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={recordMemoListPanelStyle}>
          <div style={recordMemoListHeaderStyle}>
            <div>
              <h3 style={{ fontSize: "22px", margin: 0 }}>
                {isAllRecordsView ? "전체 메모" : `${selectedRecord.title} 메모`}
              </h3>
              <p style={{ color: "#8A8178", fontSize: "13px", margin: "6px 0 0" }}>
                {isAllRecordsView
                  ? `모든 메모 ${visibleRecordMemoRows.length}개`
                  : recordMemoFilter
                    ? `${recordMemoFilter} 메모 ${visibleRecordMemoRows.length}개`
                    : `전체 메모 ${visibleRecordMemoRows.length}개`}
              </p>
            </div>
            <input
              value={recordMemoSearch}
              onChange={(e) => setRecordMemoSearch(e.target.value)}
              style={recordMemoSearchInputStyle}
              placeholder="메모 제목, 내용, 출처 검색"
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {visibleRecordMemoRows.length === 0 && (
              <div style={{ color: "#8A8178", fontSize: "14px" }}>
                아직 모아볼 메모가 없어요. 상단 세부 카테고리를 눌러 메모를 추가해보세요.
              </div>
            )}

            {visibleRecordMemoRows.map(({ memo, record }) => (
              <div key={`${record.id}-${memo.id}`} style={recordMemoListRowStyle}>
                <button
                  onClick={() => {
                    openExistingRecordMemo(record, memo);
                  }}
                  style={recordMemoRowMainButtonStyle}
                >
                  <div style={recordMemoListMainStyle}>
                    <span
                      style={{
                        ...recordMemoColorBadgeStyle,
                        background: getRecordCategoryColor(record),
                      }}
                    >
                      {record.title}
                    </span>
                    <span style={recordMemoDividerStyle}>|</span>
                    <span
                      style={{
                        ...recordMemoColorBadgeStyle,
                        background: getRecordSubCategoryColor(record, memo.subCategory),
                      }}
                    >
                      {memo.subCategory}
                    </span>
                    <span style={recordMemoListTitleStyle}>{memo.title}</span>
                  </div>
                  <div style={recordMemoListMetaStyle}>
                    {memo.source && <span>출처 {memo.source}</span>}
                    <span>{memo.createdAt}</span>
                  </div>
                </button>
                <button
                  onClick={() => deleteRecordMemo(record.id, memo.id)}
                  style={recordMemoDeleteButtonStyle}
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {isRecordMemoModalOpen && selectedRecordItem && (
        <div style={modalBackdropStyle}>
          <div style={{ ...modalBoxStyle, width: "520px", padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "16px" }}>
              <div>
                <h2 style={{ fontSize: "26px", fontWeight: "bold", margin: 0 }}>
                  {editingRecordMemoId ? "메모 보기" : `${selectedRecordItem} 메모`}
                </h2>
                <p style={{ color: "#8A8178", margin: "10px 0 0", fontSize: "14px" }}>
                  {selectedRecord.title} | {selectedRecordItem} · {selectedRecordMemos.length}개 메모
                </p>
              </div>

              <button
                onClick={() => setIsRecordMemoModalOpen(false)}
                style={closeButtonStyle}
              >
                ×
              </button>
            </div>

            <div style={recordMemoCreatedAtStyle}>
              생성일시 {currentRecordMemoCreatedAt}
            </div>
            <div style={twoColumnStyle}>
              <div>
                <FormLabel title="카테고리" />
                <select
                  value={selectedRecord.id}
                  onChange={(e) => {
                    const nextRecord = syncedRecords.find((record) => record.id === Number(e.target.value));
                    if (!nextRecord) return;
                    const nextItem = nextRecord.items[0] || "";
                    setSelectedRecordId(nextRecord.id);
                    setSelectedRecordItem(nextItem);
                    setRecordMemoFilter(nextItem);
                  }}
                  style={selectStyle}
                >
                  {syncedRecords.map((record) => (
                    <option key={record.id} value={record.id}>
                      {record.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <FormLabel title="하위 카테고리" />
                <select
                  value={selectedRecordItem}
                  onChange={(e) => {
                    setSelectedRecordItem(e.target.value);
                    setRecordMemoFilter(e.target.value);
                  }}
                  style={selectStyle}
                >
                  {selectedRecord.items.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <FormLabel title="메모 제목" />
            <input
              value={recordMemoTitle}
              onChange={(e) => setRecordMemoTitle(e.target.value)}
              style={inputStyle}
              placeholder="메모 제목을 적어주세요."
            />
            <FormLabel title="메모 내용" />
            <textarea
              value={recordMemoContent}
              onChange={(e) => setRecordMemoContent(e.target.value)}
              style={{ ...inputStyle, height: "150px", resize: "none", paddingTop: "16px" }}
              placeholder={`${selectedRecordItem}에 남길 메모를 적어주세요.`}
            />

            <FormLabel title="출처" />
            <input
              value={recordMemoSource}
              onChange={(e) => setRecordMemoSource(e.target.value)}
              style={inputStyle}
              placeholder="쓰고 싶으면 적어주세요."
            />

            <button style={{ ...redButtonFull, marginTop: "22px" }} onClick={saveRecordMemo}>
              {editingRecordMemoId ? "수정하기" : "추가하기"}
            </button>
            {editingRecordMemoId && (
              <button style={deleteFullButtonStyle} onClick={deleteEditingRecordMemo}>
                삭제하기
              </button>
            )}
          </div>
        </div>
      )}

      {isSettingsOpen && (
        <div style={modalBackdropStyle}>
          <div style={{ ...modalBoxStyle, width: "720px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <h2 style={{ fontSize: "32px", fontWeight: "bold", margin: 0 }}>
                  기록 센터 설정
                </h2>
                <p style={{ color: "#6b7280", marginTop: "12px" }}>
                  카테고리를 추가, 수정, 삭제할 수 있어요.
                </p>
              </div>

              <button
                onClick={() => {
                  setIsSettingsOpen(false);
                  resetRecordForm();
                }}
                style={closeButtonStyle}
              >
                ×
              </button>
            </div>

            <div style={recordSettingsGridStyle}>
              <div style={recordSettingsListStyle}>
                {syncedRecords.map((record) => (
                  <div key={record.id} style={recordSettingsItemStyle}>
                    <button
                      onClick={() => openEditRecord(record)}
                      style={{
                        flex: 1,
                        border: "none",
                        background: "transparent",
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontWeight: "bold", color: "#191f28" }}>{record.title}</div>
                      <div style={{ color: "#8A8178", fontSize: "13px", marginTop: "4px" }}>
                        {record.desc}
                      </div>
                    </button>

                    <button onClick={() => deleteRecord(record.id)} style={smallDangerButtonStyle}>
                      삭제
                    </button>
                  </div>
                ))}
              </div>

              <div>
                <FormLabel title={editingRecordId ? "카테고리 수정" : "카테고리 추가"} />
                <input
                  value={recordTitle}
                  onChange={(e) => setRecordTitle(e.target.value)}
                  style={inputStyle}
                  placeholder="예: 독서 노트"
                />

                <FormLabel title="설명" />
                <textarea
                  value={recordDesc}
                  onChange={(e) => setRecordDesc(e.target.value)}
                  style={{ ...inputStyle, height: "96px", resize: "none", paddingTop: "16px" }}
                  placeholder="이 기록 공간의 용도를 적어주세요."
                />

                {editingRecordId && (
                  <>
                    <FormLabel title="카테고리 색상" />
                    <ColorScrollPicker
                      value={
                        recordCategoryColors[
                          syncedRecords.find((record) => record.id === editingRecordId)?.title || recordTitle
                        ] || getPaletteColor(recordTitle, editingRecordId)
                      }
                      onChange={(color) => {
                        const targetTitle =
                          syncedRecords.find((record) => record.id === editingRecordId)?.title || recordTitle;
                        setRecordCategoryColors({
                          ...recordCategoryColors,
                          [targetTitle]: color,
                        });
                      }}
                    />
                  </>
                )}

                <FormLabel title="세부 카테고리" />
                <div style={projectDraftTodoPanelStyle}>
                  {recordItems.map((item, index) => (
                    <div key={`${item}-${index}`} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <div style={subTodoAddRowStyle}>
                        <input
                          value={item}
                          onChange={(e) => updateRecordItem(index, e.target.value)}
                          style={projectSubTodoInputStyle}
                        />

                        <button onClick={() => deleteRecordItem(index)} style={smallGhostButtonStyle}>
                          삭제
                        </button>
                      </div>
                      <ColorScrollPicker
                        value={
                          recordSubCategoryColors[`${recordTitle}-${item}`] ||
                          getPaletteColor(`${recordTitle}-${item}`, index)
                        }
                        onChange={(color) =>
                          setRecordSubCategoryColors({
                            ...recordSubCategoryColors,
                            [`${recordTitle}-${item}`]: color,
                          })
                        }
                      />
                    </div>
                  ))}

                  <div style={subTodoAddRowStyle}>
                    <input
                      value={newRecordItem}
                      onChange={(e) => setNewRecordItem(e.target.value)}
                      onKeyDown={(e) => {
                        if (shouldSubmitByEnter(e)) addRecordItem();
                      }}
                      style={projectSubTodoInputStyle}
                      placeholder="세부 카테고리 추가"
                    />

                    <button onClick={addRecordItem} style={smallGhostButtonStyle}>
                      추가
                    </button>
                  </div>
                </div>

                <button style={redButtonFull} onClick={saveRecord}>
                  {editingRecordId ? "수정하기" : "추가하기"}
                </button>

                {editingRecordId && (
                  <button style={deleteFullButtonStyle} onClick={resetRecordForm}>
                    새 카테고리 입력
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TrashPage({
  trashItems,
  onRestore,
}: {
  trashItems: TrashItem[];
  onRestore: (trashId: number) => void;
}) {
  const trashSections: TrashItem["section"][] = ["캘린더", "플래너", "프로젝트 센터", "기록 센터"];
  const [selectedTrashSection, setSelectedTrashSection] = useState<TrashItem["section"]>("캘린더");
  const [selectedTrashItem, setSelectedTrashItem] = useState<TrashItem | null>(null);
  const selectedItems = trashItems.filter((item) => item.section === selectedTrashSection);

  return (
    <div>
      <div style={pageHeaderStyle}>
        <div>
          <h2 style={{ fontSize: "36px", fontWeight: "bold", marginBottom: "8px" }}>
            휴지통
          </h2>
          <p style={{ color: "#8A8178", margin: 0 }}>
            삭제한 항목을 영역별로 확인하고 복구할 수 있어요.
          </p>
        </div>
      </div>

      <div style={trashGridStyle}>
        <div style={trashSectionStyle}>
          {trashSections.map((section) => {
            const count = trashItems.filter((item) => item.section === section).length;
            const selected = selectedTrashSection === section;

            return (
              <button
                key={section}
                onClick={() => setSelectedTrashSection(section)}
                style={{
                  ...trashCategoryButtonStyle,
                  ...(selected ? recordThinButtonActiveStyle : {}),
                }}
              >
                <span>{section}</span>
                <span>{count}개</span>
              </button>
            );
          })}
        </div>

        <div style={trashSectionStyle}>
          <div style={trashSectionHeaderStyle}>
            <strong>{selectedTrashSection}</strong>
            <span>{selectedItems.length}개</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {selectedItems.length === 0 && (
              <div style={{ color: "#8A8178", fontSize: "13px" }}>
                삭제 내역 없음
              </div>
            )}

            {selectedItems.map((item) => (
              <div key={item.id} style={trashItemStyle}>
                <button
                  onClick={() => setSelectedTrashItem(item)}
                  style={{ border: "none", background: "transparent", textAlign: "left", cursor: "pointer" }}
                >
                  <div style={{ fontWeight: "800", color: "#191f28" }}>{item.title}</div>
                  <div style={{ color: "#8A8178", fontSize: "12px", marginTop: "4px" }}>
                    {item.deletedAt}
                  </div>
                </button>
                <button onClick={() => onRestore(item.id)} style={smallGhostButtonStyle}>
                  복구
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {selectedTrashItem && (
        <div style={modalBackdropStyle}>
          <div style={{ ...modalBoxStyle, width: "460px", padding: "26px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "16px" }}>
              <div>
                <h2 style={{ fontSize: "26px", margin: 0 }}>{selectedTrashItem.title}</h2>
                <p style={{ color: "#8A8178", margin: "10px 0 0", fontSize: "14px" }}>
                  {selectedTrashItem.section} · {selectedTrashItem.deletedAt}
                </p>
              </div>
              <button onClick={() => setSelectedTrashItem(null)} style={closeButtonStyle}>
                ×
              </button>
            </div>
            <button
              style={redButtonFull}
              onClick={() => {
                onRestore(selectedTrashItem.id);
                setSelectedTrashItem(null);
              }}
            >
              복구하기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
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
                    style={{
                      ...calendarDayColumnStyle,
                      height: (endHour - startHour + 1) * hourHeight,
                      background: isToday ? "#F8FBFF" : "white",
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

                    {dayEvents.map((event) => {
                      if (!event.start?.dateTime) return null;

                      const position = getEventPosition(event);

                      return (
                        <button
                          key={event.id}
                          onClick={() => openEditEventModal(event)}
                          style={{
                            ...calendarEventButtonStyle,
                            top: position.top,
                            height: position.height,
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
        <div style={modalBackdropStyle}>
          <div style={{ ...modalBoxStyle, width: "520px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <h2 style={{ fontSize: "32px", fontWeight: "bold", margin: 0 }}>
                {editingEventId ? "일정 수정" : "일정 추가"}
              </h2>

              <button onClick={() => setIsEventModalOpen(false)} style={closeButtonStyle}>
                ×
              </button>
            </div>

            <FormLabel title="일정 제목" />
            <input
              value={eventTitle}
              onChange={(e) => setEventTitle(e.target.value)}
              style={inputStyle}
              placeholder="예: 미팅"
            />

            <FormLabel title="시작 시간" />
            <input
              type="datetime-local"
              value={eventStart}
              onChange={(e) => setEventStart(e.target.value)}
              style={inputStyle}
            />

            <FormLabel title="종료 시간" />
            <input
              type="datetime-local"
              value={eventEnd}
              onChange={(e) => setEventEnd(e.target.value)}
              style={inputStyle}
            />

            <button style={redButtonFull} onClick={saveGoogleEvent}>
              {editingEventId ? "수정하기" : "추가하기"}
            </button>

            {editingEventId && (
              <button style={deleteFullButtonStyle} onClick={deleteGoogleEvent}>
                삭제하기
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MemoCell({
  memos,
  todos,
  sortTodos,
  openMemoModal,
  openTodoModal,
  openEditTodoModal,
  toggleDone,
}: {
  memos: Memo[];
  todos: Todo[];
  sortTodos: (todos: Todo[]) => Todo[];
  openMemoModal: () => void;
  openTodoModal: (cellKey: string) => void;
  openEditTodoModal: (todo: Todo) => void;
  toggleDone: (id: number) => void;
}) {
  const sortedTodos = sortTodos(todos);

  return (
    <div style={memoCellWrapperStyle}>
      <div style={memoSectionStyle}>
        <div style={memoHeaderStyle}>
          <div style={memoTitleStyle}>주간 메모</div>
          <button onClick={openMemoModal} style={miniAddButtonStyle}>
            + 메모 추가
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {memos.map((memo) => (
            <div key={memo.id} style={memoCardStyle}>
              {memo.content}
            </div>
          ))}
        </div>
      </div>

      <div style={memoSectionStyle}>
        <div style={memoHeaderStyle}>
          <div style={memoTitleStyle}>이번 주 To do</div>
          <button onClick={() => openTodoModal("memo")} style={miniAddButtonStyle}>
            + 할일 추가
          </button>
        </div>

        <PlannerMemoTodoList
          todos={sortedTodos}
          openEditTodoModal={openEditTodoModal}
          toggleDone={toggleDone}
        />
      </div>
    </div>
  );
}

function PlannerMemoTodoList({
  todos,
  openEditTodoModal,
  toggleDone,
}: {
  todos: Todo[];
  openEditTodoModal: (todo: Todo) => void;
  toggleDone: (id: number) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "10px" }}>
      {todos.length === 0 && <div style={plannerEmptyTextStyle}>없음</div>}
      {todos.map((todo) => (
        <div key={todo.id} style={todoCardStyle}>
          <input
            type="checkbox"
            checked={todo.done}
            onChange={() => toggleDone(todo.id)}
            style={{ width: "16px", height: "16px", accentColor: "#B40023" }}
          />
          <button
            onClick={() => openEditTodoModal(todo)}
            style={{
              flex: 1,
              border: "none",
              background: "transparent",
              textAlign: "left",
              color: todo.done ? "#B40023" : "#191f28",
              textDecoration: todo.done ? "line-through" : "none",
              cursor: "pointer",
            }}
          >
            [{todo.subArea}] {todo.title}
          </button>
        </div>
      ))}
    </div>
  );
}

function TodoListGroup({
  title,
  todos,
  toggleDone,
  openTodo,
}: {
  title: string;
  todos: Todo[];
  toggleDone: (id: number) => void;
  openTodo: (todo: Todo) => void;
}) {
  return (
    <div style={todoListGroupStyle}>
      <div style={todoListGroupTitleStyle}>
        <span>{title}</span>
        <span>{todos.length}개</span>
      </div>

      {todos.length === 0 ? (
        <div style={plannerEmptyTextStyle}>없음</div>
      ) : (
        todos.map((todo) => (
          <div key={todo.id} style={todoCardStyle}>
            <input
              type="checkbox"
              checked={todo.done}
              onChange={() => toggleDone(todo.id)}
              style={{ width: "16px", height: "16px", accentColor: "#B40023" }}
            />
            <button
              onClick={() => openTodo(todo)}
              style={{
                flex: 1,
                border: "none",
                background: "transparent",
                textAlign: "left",
                cursor: "pointer",
                color: todo.done ? "#B40023" : "#191f28",
              }}
            >
              [{todo.area} / {todo.subArea}] {todo.title}
              {todo.dueDate && <span style={{ color: "#8A8178" }}> · {todo.dueDate}</span>}
            </button>
          </div>
        ))
      )}
    </div>
  );
}

function TodoAreaGroups({
  todos,
  sortTodos,
  openEditTodoModal,
  toggleDone,
}: {
  todos: Todo[];
  sortTodos: (todos: Todo[]) => Todo[];
  openEditTodoModal: (todo: Todo) => void;
  toggleDone: (id: number) => void;
}) {
  return (
    <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "14px" }}>
      {(["일", "관리", "일상"] as Area[]).map((areaName) => {
        const areaTodos = sortTodos(todos.filter((todo) => todo.area === areaName));
        if (areaTodos.length === 0) return null;

        return (
          <div key={areaName} style={areaBoxStyle}>
            <div style={areaLabelStyle}>{areaName}</div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {areaTodos.map((todo) => (
                <div
                  key={todo.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("todoId", String(todo.id))}
                  style={todoCardStyle}
                >
                  <input
                    type="checkbox"
                    checked={todo.done}
                    onChange={() => toggleDone(todo.id)}
                    style={{
                      width: "18px",
                      height: "18px",
                      accentColor: "#B40023",
                      cursor: "pointer",
                    }}
                  />

                  <button
                    onClick={() => openEditTodoModal(todo)}
                    style={{
                      flex: 1,
                      background: "none",
                      border: "none",
                      textAlign: "left",
                      cursor: "grab",
                      fontSize: "14px",
                      textDecoration: todo.done ? "line-through" : "none",
                      color: todo.done ? "#B40023" : "#191f28",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                      <div>
                        [{todo.subArea}] {todo.title}
                        <br />
                        <span style={{ fontSize: "12px", color: "#6b7280" }}>
                          긴 {"⭐️".repeat(todo.urgency || 0)}
                          {" / "}
                          중 {"⭐️".repeat(todo.importance || 0)}
                        </span>
                      </div>

                      <div style={{ minWidth: "54px" }}>
                        <div
                          style={{
                            width: "48px",
                            height: "6px",
                            background: "#F1D8DE",
                            borderRadius: "999px",
                            overflow: "hidden",
                            marginTop: "6px",
                          }}
                        >
                          <div
                            style={{
                              width: `${todo.progress}%`,
                              height: "100%",
                              background: "#B40023",
                              borderRadius: "999px",
                            }}
                          />
                        </div>

                        <div
                          style={{
                            fontSize: "11px",
                            color: "#B40023",
                            marginTop: "4px",
                            textAlign: "right",
                            fontWeight: "bold",
                          }}
                        >
                          {todo.progress}%
                        </div>
                      </div>
                    </div>
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TodayBadge() {
  return <div style={todayBadgeStyle}>오늘</div>;
}

function MenuItem({
  title,
  active,
  onClick,
}: {
  title: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "10px 9px",
        borderRadius: "10px",
        background: active ? "#FFF4F6" : "#FFFCF8",
        border: active ? "1px solid #F0BAC6" : "1px solid #F0ECE6",
        color: active ? "#B40023" : "#4e5968",
        fontWeight: active ? "bold" : "normal",
        cursor: "pointer",
        fontSize: "13px",
      }}
    >
      {title}
    </div>
  );
}

function FormLabel({ title }: { title: string }) {
  return <div style={{ fontWeight: "bold", marginTop: "14px", marginBottom: "8px", fontSize: "14px" }}>{title}</div>;
}

function ColorScrollPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div style={colorScrollPickerStyle}>
      {recordColorPalette.map((color) => (
        <button
          key={color}
          onClick={() => onChange(color)}
          aria-label={`색상 ${color}`}
          style={{
            ...colorSwatchButtonStyle,
            background: color,
            outline: value === color ? "2px solid #191f28" : "none",
          }}
        />
      ))}
    </div>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div style={{ display: "flex", gap: "6px", height: "56px", alignItems: "center" }}>
      {[1, 2, 3].map((star) => (
        <button
          key={star}
          onClick={() => onChange(value === star ? 0 : star)}
          style={{
            width: "40px",
            height: "40px",
            border: "none",
            background: value >= star ? "#FFF4F6" : "#f7f8fa",
            borderRadius: "12px",
            cursor: "pointer",
            fontSize: "20px",
            fontWeight: "900",
            color: value >= star ? "#B40023" : "#d1d6db",
          }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function ProgressBarInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div style={{ height: "56px", display: "flex", alignItems: "center", gap: "12px", width: "100%" }}>
      <input
        type="range"
        min="0"
        max="100"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1, accentColor: "#B40023", cursor: "pointer" }}
      />

      <div style={progressValueStyle}>{value}%</div>
    </div>
  );
}

const pageHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: "20px",
  flexWrap: "wrap" as const,
  gap: "12px",
};

const sidebarStyle = {
  width: "148px",
  background: "#FFFCF8",
  borderRight: "1px solid #e5e8eb",
  padding: "14px 10px",
  display: "flex" as const,
  flexDirection: "column" as const,
};

const plannerOuterStyle = {
  background: "#FFFCF8",
  borderRadius: "18px",
  border: "1px solid #E8E1D8",
  padding: "14px",
  boxShadow: "0 8px 24px rgba(0,0,0,0.04)",
};

const plannerGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(230px, 1fr))",
  gridTemplateRows: "repeat(2, minmax(420px, calc((100vh - 220px) / 2)))",
  border: "1px solid #dfe3e8",
  background: "#FFFCF8",
  overflowX: "auto" as const,
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

const calendarDayColumnStyle = {
  position: "relative" as const,
  borderRight: "1px solid #E8EAED",
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

const twoColumnStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "40px",
  marginTop: "20px",
};

const splitRowStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "40px",
  marginTop: "20px",
};

const halfBlockStyle = {
  display: "flex",
  gap: "24px",
  alignItems: "flex-end",
};

const inputStyle = {
  width: "100%",
  height: "56px",
  borderRadius: "18px",
  border: "1px solid #E8E1D8",
  padding: "0 18px",
  fontSize: "16px",
  boxSizing: "border-box" as const,
};

const colorScrollPickerStyle = {
  display: "flex",
  gap: "8px",
  overflowX: "auto" as const,
  padding: "4px 2px 8px",
};

const colorSwatchButtonStyle = {
  width: "26px",
  height: "26px",
  borderRadius: "999px",
  border: "2px solid #FFFFFF",
  boxShadow: "0 0 0 1px #E8E1D8",
  cursor: "pointer",
  flex: "0 0 auto",
};

const selectStyle = {
  ...inputStyle,
  appearance: "none" as const,
  WebkitAppearance: "none" as const,
  background: "#FFFDF9",
  paddingRight: "48px",
};

const selectArrowStyle = {
  position: "absolute" as const,
  right: "18px",
  top: "50%",
  transform: "translateY(-50%)",
  color: "#8A8178",
  pointerEvents: "none" as const,
  fontSize: "20px",
};

const subAreaSelectButtonStyle = {
  ...inputStyle,
  position: "relative" as const,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  textAlign: "left" as const,
  background: "#FFFDF9",
  cursor: "pointer",
  paddingRight: "48px",
};

const todoListGroupWrapStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: "14px",
  marginTop: "16px",
};

const todoListGroupStyle = {
  borderTop: "1px solid #E8E1D8",
  paddingTop: "10px",
};

const todoListGroupTitleStyle = {
  display: "flex",
  justifyContent: "space-between",
  color: "#4e5968",
  fontSize: "13px",
  fontWeight: "800",
  marginBottom: "6px",
};

const miniAddButtonStyle = {
  color: "#8A8178",
  fontSize: "13px",
  background: "none",
  border: "none",
  cursor: "pointer",
};

const areaBoxStyle = {
  background: "transparent",
  borderRadius: 0,
  padding: "8px 0 0",
  borderTop: "1px solid #E8E1D8",
};

const areaLabelStyle = {
  display: "inline-block",
  background: "#FFF8EE",
  border: "1px solid #E8D8D8",
  borderRadius: "999px",
  padding: "3px 9px",
  fontSize: "11px",
  fontWeight: "700",
  color: "#B40023",
  marginBottom: "6px",
  letterSpacing: "-0.2px",
};

const todoCardStyle = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  background: "transparent",
  borderRadius: "0",
  padding: "6px 0",
  borderBottom: "1px solid #F0ECE6",
};

const memoCellWrapperStyle = {
  marginTop: "24px",
  height: "calc(100% - 52px)",
  display: "grid",
  gridTemplateRows: "1fr 1fr",
  gap: "14px",
};

const memoSectionStyle = {
  background: "transparent",
  borderRadius: 0,
  padding: "0 0 12px",
  borderBottom: "1px solid #E8E1D8",
  overflow: "auto",
};

const memoHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: "10px",
};

const memoTitleStyle = {
  fontSize: "13px",
  fontWeight: "bold",
  color: "#4e5968",
};

const memoCardStyle = {
  background: "#FFFCF8",
  borderRadius: "14px",
  padding: "10px 12px",
  border: "1px solid #eef1f4",
  fontSize: "14px",
  lineHeight: "1.5",
};

const plannerScheduleSectionStyle = {
  marginTop: "18px",
  paddingBottom: "12px",
  borderBottom: "1px solid #E8E1D8",
};

const plannerTodoSectionStyle = {
  paddingTop: "12px",
};

const plannerSectionHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "8px",
  color: "#4e5968",
  fontSize: "13px",
  fontWeight: "800",
  marginBottom: "8px",
};

const plannerScheduleListStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: "6px",
  minHeight: "26px",
};

const plannerScheduleItemStyle = {
  minHeight: "26px",
  width: "100%",
  borderRadius: "10px",
  background: "#E8F3FF",
  color: "#1B64DA",
  border: "1px solid #C9DEF9",
  padding: "5px 9px",
  fontSize: "12px",
  fontWeight: "700",
  textAlign: "left" as const,
  cursor: "pointer",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap" as const,
};

const plannerEmptyTextStyle = {
  color: "#B0A79E",
  fontSize: "12px",
};

const projectTodoBoxStyle = {
  background: "transparent",
  border: "none",
  borderBottom: "1px solid #E8E1D8",
  borderRadius: 0,
  padding: "6px 0",
};

const projectSubTodoBoxStyle = {
  background: "transparent",
  border: "none",
  borderBottom: "1px solid #F0ECE6",
  padding: "5px 0",
};

const projectSubTodoMarkerStyle = {
  color: "#B40023",
  fontSize: "14px",
  fontWeight: "900",
  textAlign: "center" as const,
};

const projectListItemStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "24px",
  width: "100%",
  background: "#F8F6F1",
  border: "1px solid #E8E1D8",
  borderRadius: "18px",
  padding: "18px 20px",
  textAlign: "left" as const,
  cursor: "pointer",
};

const projectStatusBadgeStyle = {
  padding: "6px 12px",
  borderRadius: "999px",
  background: "#FFF4F6",
  color: "#B40023",
  fontSize: "13px",
  fontWeight: "bold",
};

const projectAreaBadgeStyle = {
  padding: "6px 12px",
  borderRadius: "999px",
  background: "#E8F3FF",
  color: "#3182F6",
  fontSize: "13px",
  fontWeight: "bold",
};

const projectSubAreaOptionStyle = {
  width: "100%",
  height: "42px",
  borderRadius: "14px",
  padding: "0 14px",
  marginBottom: "8px",
  textAlign: "left" as const,
  cursor: "pointer",
  color: "#191f28",
  fontSize: "14px",
};

const projectProgressTrackStyle = {
  height: "8px",
  background: "#E8E1D8",
  borderRadius: "999px",
  overflow: "hidden",
};

const projectProgressFillStyle = {
  height: "100%",
  background: "#B40023",
};

const projectMetaColumnStyle = {
  minWidth: "116px",
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "flex-end",
  gap: "8px",
};

const projectDetailMetaStyle = {
  minWidth: "150px",
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "flex-end",
  gap: "10px",
};

const projectDetailPanelStyle = {
  background: "#FFFCF8",
  border: "1px solid #E8E1D8",
  borderRadius: "28px",
  padding: "28px",
};

const projectSummaryGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: "12px",
  marginBottom: "24px",
};

const projectSummaryItemStyle = {
  background: "#FFFCF8",
  border: "1px solid #E8E1D8",
  borderRadius: "18px",
  padding: "14px 16px",
  display: "flex",
  flexDirection: "column" as const,
  gap: "8px",
};

const projectSummaryLabelStyle = {
  color: "#8A8178",
  fontSize: "12px",
  fontWeight: "bold",
};

const projectProgressTextStyle = {
  color: "#B40023",
  fontSize: "20px",
  fontWeight: "bold",
};

const projectTodoCountStyle = {
  color: "#4e5968",
  fontSize: "13px",
  fontWeight: "bold",
};

const projectDueDateTextStyle = {
  color: "#B40023",
  fontSize: "13px",
  fontWeight: "bold",
  margin: "-6px 0 12px",
};

const projectTodoRowStyle = {
  display: "grid",
  gridTemplateColumns: "22px 1fr 52px",
  gap: "8px",
  alignItems: "center",
};

const projectTodoInputStyle = {
  width: "100%",
  height: "34px",
  borderRadius: "10px",
  border: "1px solid transparent",
  background: "transparent",
  padding: "0 8px",
  fontSize: "14px",
  boxSizing: "border-box" as const,
};

const projectTodoCollapseButtonStyle = {
  width: "30px",
  height: "30px",
  borderRadius: "10px",
  border: "1px solid #E8E1D8",
  background: "#FFFCF8",
  color: "#8A8178",
  fontSize: "13px",
  fontWeight: "900",
  cursor: "pointer",
  transition: "transform 120ms ease",
};

const subTodoListStyle = {
  marginTop: "10px",
  marginLeft: "30px",
  display: "flex",
  flexDirection: "column" as const,
  gap: "8px",
};

const subTodoAddRowStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 52px",
  gap: "8px",
};

const projectSubTodoInputStyle = {
  ...projectTodoInputStyle,
  height: "36px",
  fontSize: "13px",
};

const projectTodoAddBoxStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 72px",
  gap: "8px",
  background: "#FFFCF8",
  border: "1px solid #E8E1D8",
  borderRadius: "10px",
  padding: "6px",
};

const projectDraftTodoPanelStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: "10px",
  background: "#FFFDF9",
  border: "1px solid #E8E1D8",
  borderRadius: "18px",
  padding: "12px",
};

const iconButtonStyle = {
  width: "44px",
  height: "44px",
  borderRadius: "14px",
  border: "1px solid #E8E1D8",
  background: "#FFFCF8",
  color: "#4e5968",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

const recordSettingsGridStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1.2fr",
  gap: "28px",
  marginTop: "18px",
};

const recordCenterShellStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: "18px",
};

const recordChoicePanelStyle = {
  background: "#FFFCF8",
  border: "1px solid #E8E1D8",
  borderRadius: "20px",
  padding: "18px",
  display: "flex",
  flexDirection: "column" as const,
  gap: "10px",
};

const recordChoiceLabelStyle = {
  color: "#8A8178",
  fontSize: "12px",
  fontWeight: "800",
  height: "16px",
};

const recordSubChoiceLabelStyle = {
  ...recordChoiceLabelStyle,
  color: "#B40023",
  paddingLeft: "10px",
  borderLeft: "3px solid #B40023",
};

const recordAllHintStyle = {
  color: "#8A8178",
  fontSize: "13px",
  padding: "8px 0 4px 10px",
};

const recordThinButtonRowStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: "8px",
  alignItems: "center",
  marginBottom: "6px",
};

const recordThinButtonStyle = {
  height: "38px",
  borderRadius: "999px",
  border: "1px solid #E8E1D8",
  background: "#F8F6F1",
  color: "#4e5968",
  padding: "0 14px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  fontSize: "14px",
  fontWeight: "800",
  cursor: "pointer",
};

const recordThinButtonActiveStyle = {
  background: "#FFF4F6",
  border: "1px solid #B40023",
  color: "#B40023",
};

const recordSubThinButtonStyle = {
  background: "#FFFCF8",
  border: "1px solid #E8E1D8",
};

const recordMemoListPanelStyle = {
  background: "#FFFCF8",
  border: "1px solid #E8E1D8",
  borderRadius: "20px",
  padding: "18px",
};

const recordMemoListHeaderStyle = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "12px",
  marginBottom: "16px",
  flexWrap: "wrap" as const,
};

const recordMemoSearchInputStyle = {
  ...inputStyle,
  width: "min(320px, 100%)",
  height: "42px",
  borderRadius: "14px",
  fontSize: "14px",
};

const recordMemoListRowStyle = {
  width: "100%",
  minHeight: "46px",
  background: "#FFFCF8",
  border: "1px solid #E8E1D8",
  borderRadius: "12px",
  padding: "0 14px",
  display: "grid",
  gridTemplateColumns: "1fr 54px",
  alignItems: "center",
  gap: "16px",
  color: "#191f28",
  textAlign: "left" as const,
};

const recordMemoRowMainButtonStyle = {
  width: "100%",
  border: "none",
  background: "transparent",
  padding: 0,
  display: "grid",
  gridTemplateColumns: "1fr auto",
  alignItems: "center",
  gap: "16px",
  color: "#191f28",
  textAlign: "left" as const,
  cursor: "pointer",
};

const recordMemoDeleteButtonStyle = {
  height: "30px",
  borderRadius: "10px",
  border: "none",
  background: "#FFF4F6",
  color: "#B40023",
  fontSize: "12px",
  fontWeight: "800",
  cursor: "pointer",
};

const recordMemoListMainStyle = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  minWidth: 0,
};

const recordMemoColorBadgeStyle = {
  color: "#FFFFFF",
  fontSize: "12px",
  fontWeight: "800",
  whiteSpace: "nowrap" as const,
  borderRadius: "999px",
  padding: "3px 8px",
};

const recordMemoDividerStyle = {
  color: "#D0C7BE",
  fontSize: "13px",
};

const recordMemoListTitleStyle = {
  color: "#191f28",
  fontSize: "14px",
  fontWeight: "700",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap" as const,
};

const recordMemoListMetaStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "10px",
  color: "#8A8178",
  fontSize: "12px",
  whiteSpace: "nowrap" as const,
};

const recordMemoCreatedAtStyle = {
  background: "#F8F6F1",
  border: "1px solid #E8E1D8",
  borderRadius: "14px",
  padding: "12px 14px",
  color: "#4e5968",
  fontSize: "13px",
  fontWeight: "bold",
  marginBottom: "12px",
};

const recordSettingsListStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: "10px",
};

const recordSettingsItemStyle = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  background: "#F8F6F1",
  border: "1px solid #E8E1D8",
  borderRadius: "16px",
  padding: "12px",
};

const trashGridStyle = {
  display: "grid",
  gridTemplateColumns: "260px 1fr",
  gap: "16px",
};

const trashCategoryButtonStyle = {
  width: "100%",
  height: "44px",
  border: "1px solid #E8E1D8",
  borderRadius: "14px",
  background: "#F8F6F1",
  color: "#4e5968",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 14px",
  fontSize: "14px",
  fontWeight: "800",
  cursor: "pointer",
  marginBottom: "8px",
};

const trashSectionStyle = {
  background: "#FFFCF8",
  border: "1px solid #E8E1D8",
  borderRadius: "20px",
  padding: "24px",
  minHeight: "420px",
};

const trashSectionHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  color: "#191f28",
  marginBottom: "14px",
};

const trashItemStyle = {
  minHeight: "64px",
  display: "grid",
  gridTemplateColumns: "1fr 56px",
  alignItems: "center",
  gap: "10px",
  borderTop: "1px solid #F0ECE6",
  padding: "12px 0",
};

const smallDangerButtonStyle = {
  height: "36px",
  borderRadius: "12px",
  border: "none",
  background: "#FFF4F6",
  color: "#B40023",
  fontSize: "13px",
  fontWeight: "bold",
  cursor: "pointer",
};

const smallGhostButtonStyle = {
  height: "34px",
  borderRadius: "11px",
  border: "none",
  background: "#eef1f4",
  color: "#4e5968",
  fontSize: "12px",
  fontWeight: "bold",
  cursor: "pointer",
};

const todayBadgeStyle = {
  position: "absolute" as const,
  top: "14px",
  right: "14px",
  fontSize: "12px",
  color: "#3182f6",
  border: "1px solid #3182f6",
  borderRadius: "999px",
  padding: "3px 8px",
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

const modalBoxStyle = {
  width: "min(860px, calc(100vw - 32px))",
  maxHeight: "90vh",
  overflowY: "auto" as const,
  background: "#FFFCF8",
  borderRadius: "28px",
  padding: "clamp(20px, 4vw, 36px)",
};

const projectDetailModalStyle = {
  ...modalBoxStyle,
  width: "min(1120px, calc(100vw - 72px))",
  maxHeight: "calc(100vh - 72px)",
  padding: "28px",
};

const closeButtonStyle = {
  width: "44px",
  height: "44px",
  borderRadius: "50%",
  border: "none",
  fontSize: "24px",
  cursor: "pointer",
};

const subDropdownStyle = {
  position: "absolute" as const,
  top: "92px",
  left: 0,
  right: 0,
  background: "#FFFCF8",
  border: "1px solid #E8E1D8",
  borderRadius: "20px",
  padding: "14px",
  boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
  zIndex: 10,
};

const subAddBoxStyle = {
  background: "#f8fafc",
  border: "1px solid #dce6f2",
  borderRadius: "18px",
  padding: "12px",
  marginBottom: "14px",
};

const subListBoxStyle = {
  background: "#FFFCF8",
  border: "1px solid #f0f2f4",
  borderRadius: "18px",
  padding: "12px",
};

const subSectionTitleStyle = {
  fontSize: "13px",
  fontWeight: "bold",
  color: "#6b7280",
  marginBottom: "8px",
};

const subButtonSmall = {
  width: "72px",
  height: "56px",
  borderRadius: "18px",
  border: "none",
  background: "#eef1f4",
  color: "#4e5968",
  fontSize: "15px",
  fontWeight: "bold",
  cursor: "pointer",
};

const deleteButtonStyle = {
  width: "54px",
  borderRadius: "14px",
  border: "none",
  background: "#f7f8fa",
  color: "#6b7280",
  cursor: "pointer",
};

const progressValueStyle = {
  width: "52px",
  height: "36px",
  borderRadius: "12px",
  background: "#f7f8fa",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: "bold",
  color: "#B40023",
  fontSize: "14px",
};

const redButtonFull = {
  width: "100%",
  height: "64px",
  borderRadius: "22px",
  border: "none",
  background: "#B40023",
  color: "white",
  fontSize: "20px",
  fontWeight: "bold",
  marginTop: "32px",
  cursor: "pointer",
};

const deleteFullButtonStyle = {
  width: "100%",
  height: "56px",
  borderRadius: "20px",
  border: "none",
  background: "#f2f4f6",
  color: "#B40023",
  fontSize: "17px",
  fontWeight: "bold",
  marginTop: "12px",
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

const plannerQuickAddButtonStyle = {
  width: "44px",
  height: "44px",
  borderRadius: "50%",
  border: "none",
  background: "#B40023",
  color: "white",
  fontSize: "26px",
  fontWeight: "500",
  lineHeight: 1,
  cursor: "pointer",
  boxShadow: "0 8px 18px rgba(180,0,35,0.22)",
};
