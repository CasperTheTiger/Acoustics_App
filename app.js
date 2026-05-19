const starterTasks = [
  { title: "Create the GitHub repository", done: false },
  { title: "Publish this app with GitHub Pages", done: false },
  { title: "Customize the app name and colors", done: true }
];

const taskForm = document.querySelector("#taskForm");
const taskInput = document.querySelector("#taskInput");
const taskList = document.querySelector("#taskList");
const taskTemplate = document.querySelector("#taskTemplate");
const emptyState = document.querySelector("#emptyState");
const totalCount = document.querySelector("#totalCount");
const activeCount = document.querySelector("#activeCount");
const doneCount = document.querySelector("#doneCount");
const clearDoneButton = document.querySelector("#clearDoneButton");
const filterButtons = document.querySelectorAll(".filter");

let tasks = loadTasks();
let currentFilter = "all";

function loadTasks() {
  const savedTasks = localStorage.getItem("launch-board-tasks");
  return savedTasks ? JSON.parse(savedTasks) : starterTasks;
}

function saveTasks() {
  localStorage.setItem("launch-board-tasks", JSON.stringify(tasks));
}

function renderTasks() {
  taskList.innerHTML = "";

  const visibleTasks = tasks.filter((task) => {
    if (currentFilter === "active") return !task.done;
    if (currentFilter === "done") return task.done;
    return true;
  });

  visibleTasks.forEach((task) => {
    const item = taskTemplate.content.firstElementChild.cloneNode(true);
    const checkbox = item.querySelector("input");
    const title = item.querySelector(".task-title");
    const removeButton = item.querySelector(".remove-button");

    item.classList.toggle("done", task.done);
    checkbox.checked = task.done;
    title.textContent = task.title;

    checkbox.addEventListener("change", () => {
      task.done = checkbox.checked;
      saveTasks();
      renderTasks();
    });

    removeButton.addEventListener("click", () => {
      tasks = tasks.filter((candidate) => candidate !== task);
      saveTasks();
      renderTasks();
    });

    taskList.append(item);
  });

  totalCount.textContent = tasks.length;
  activeCount.textContent = tasks.filter((task) => !task.done).length;
  doneCount.textContent = tasks.filter((task) => task.done).length;
  emptyState.classList.toggle("visible", visibleTasks.length === 0);
}

taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = taskInput.value.trim();

  if (!title) return;

  tasks.unshift({ title, done: false });
  taskInput.value = "";
  saveTasks();
  renderTasks();
});

clearDoneButton.addEventListener("click", () => {
  tasks = tasks.filter((task) => !task.done);
  saveTasks();
  renderTasks();
});

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;
    filterButtons.forEach((candidate) => {
      candidate.classList.toggle("active", candidate === button);
    });
    renderTasks();
  });
});

renderTasks();
