import React, { useState, useEffect, useRef } from "react";
import {
  FaUserCircle,
  FaPaperclip,
  FaTelegramPlane,
  FaImage,
  FaFileAlt,
  FaVideo,
  FaSearch,
  FaArrowLeft,
  FaCamera,
  FaTimes,
} from "react-icons/fa";

const Chat = () => {
  const [activeTab, setActiveTab] = useState("chats");
  const [showAttachments, setShowAttachments] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedChat, setSelectedChat] = useState(null);
  const [inputMsg, setInputMsg] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  // Profile State
  const [profile, setProfile] = useState({
    name: "Dilawar",
    status: "Hey there! I am using Chat.",
    image: null,
  });

  const attachmentRef = useRef(null);
  const modalRef = useRef(null);
  const fileInputRef = useRef(null);
  const [chatList, setChatList] = useState([
    {
      id: 1,
      name: "Abdul",
      lastMsg: "Hi, how are you?",
      time: "10:00 AM",
      online: true,
      messages: [],
    },
    {
      id: 2,
      name: "Aamir",
      lastMsg: "Meeting at 5?",
      time: "09:30 AM",
      online: false,
      messages: [],
    },
    {
      id: 3,
      name: "Usama",
      lastMsg: "Project report send kar di hai.",
      time: "09:15 AM",
      online: true,
      messages: [],
    },
    {
      id: 4,
      name: "Zaryab",
      lastMsg: "Kal milte hain office mein.",
      time: "Yesterday",
      online: false,
      messages: [],
    },
    {
      id: 5,
      name: "Hamza",
      lastMsg: "Design finalize ho gaya?",
      time: "Yesterday",
      online: true,
      messages: [],
    },
    {
      id: 6,
      name: "Bilal",
      lastMsg: "Okay, noted.",
      time: "08:45 AM",
      online: true,
      messages: [],
    },
    {
      id: 7,
      name: "Salman",
      lastMsg: "Check the new API docs.",
      time: "Monday",
      online: false,
      messages: [],
    },
    {
      id: 8,
      name: "Rizwan",
      lastMsg: "Client meeting scheduled.",
      time: "Sunday",
      online: true,
      messages: [],
    },
    {
      id: 9,
      name: "Zubair",
      lastMsg: "Let's grab coffee.",
      time: "11:20 AM",
      online: false,
      messages: [],
    },
    {
      id: 10,
      name: "Faisal",
      lastMsg: "Vite build issues solved.",
      time: "02:10 PM",
      online: true,
      messages: [],
    },
    {
      id: 11,
      name: "Arsalan",
      lastMsg: "I'll call you later.",
      time: "12:05 PM",
      online: false,
      messages: [],
    },
    {
      id: 12,
      name: "Kamran",
      lastMsg: "Happy Birthday!",
      time: "05/04/2026",
      online: true,
      messages: [],
    },
    {
      id: 13,
      name: "Waqas",
      lastMsg: "Code review is done.",
      time: "Wednesday",
      online: false,
      messages: [],
    },
    {
      id: 14,
      name: "Nabeel",
      lastMsg: "Files received, thanks.",
      time: "Thursday",
      online: true,
      messages: [],
    },
    {
      id: 15,
      name: "Tayyab",
      lastMsg: "See you at the conference.",
      time: "Friday",
      online: false,
      messages: [],
    },
  ]);

  const [contacts] = useState([
    { id: 101, name: "Zaryab Developer", status: "Available", online: true },
    { id: 102, name: "Usama Client", status: "Busy", online: false },
    { id: 103, name: "Ali Designer", status: "At Work", online: true },
    { id: 104, name: "Hamza React Dev", status: "Available", online: true },
    { id: 105, name: "Bilal Backend", status: "Meeting", online: false },
    { id: 106, name: "Salman SQA", status: "Testing...", online: true },
    {
      id: 107,
      name: "Rizwan Manager",
      status: "Urgent calls only",
      online: true,
    },
    { id: 108, name: "Zubair HR", status: "Available", online: false },
    { id: 109, name: "Faisal Lead", status: "Coding", online: true },
    { id: 110, name: "Arsalan Friend", status: "At Gym", online: false },
    { id: 111, name: "Kamran Team Lead", status: "Available", online: true },
    { id: 112, name: "Waqas DevOps", status: "System Update", online: true },
    { id: 113, name: "Nabeel Intern", status: "Learning React", online: false },
    {
      id: 114,
      name: "Tayyab Support",
      status: "How can I help?",
      online: true,
    },
    { id: 115, name: "Saad Marketing", status: "Available", online: false },
  ]);

  // Click Outside Logic for Modal and Attachments
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        attachmentRef.current &&
        !attachmentRef.current.contains(event.target)
      ) {
        setShowAttachments(false);
      }
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        setShowProfileModal(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSend = () => {
    if (inputMsg.trim() && selectedChat) {
      const newMessage = {
        id: Date.now(),
        text: inputMsg,
        sender: "me",
        time: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      const updatedChat = {
        ...selectedChat,
        messages: [...(selectedChat.messages || []), newMessage],
      };
      setSelectedChat(updatedChat);
      setChatList(
        chatList.map((c) => (c.id === selectedChat.id ? updatedChat : c)),
      );
      setInputMsg("");
    }
  };

  const filteredList =
    activeTab === "chats"
      ? chatList.filter((c) =>
          c.name.toLowerCase().includes(searchTerm.toLowerCase()),
        )
      : contacts.filter((c) =>
          c.name.toLowerCase().includes(searchTerm.toLowerCase()),
        );

  return (
    <div className="flex h-screen bg-white font-sans overflow-hidden border shadow-sm max-w-[1400px] mx-auto relative">
      {/* --- PROFILE MODAL --- */}
      {showProfileModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40">
          <div
            ref={modalRef}
            className="bg-white w-full max-w-md rounded-xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200"
          >
            {/* Modal Header */}
            <div className="bg-[#2ecc71] p-4 flex justify-between items-center text-white">
              <div className="flex items-center gap-2">
                <FaUserCircle size={20} />
                <span className="font-bold">Profile</span>
              </div>
              <button
                onClick={() => setShowProfileModal(false)}
                className="hover:rotate-90 transition-transform"
              >
                <FaTimes size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-8 flex flex-col items-center">
              <div className="relative mb-6">
                <div className="w-32 h-32 rounded-full bg-gradient-to-tr from-gray-200 to-gray-300 flex items-center justify-center overflow-hidden border-4 border-gray-50">
                  {profile.image ? (
                    <img
                      src={profile.image}
                      alt="Profile"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <FaUserCircle className="text-gray-400 w-full h-full scale-110" />
                  )}
                </div>
                <button
                  onClick={() => fileInputRef.current.click()}
                  className="absolute bottom-[-37px] right-[-20px] bg-[#2ecc71] text-white p-2.5 rounded border-4 hover:scale-101 transition-transform shadow-lg flex items-center justify-center gap-2 text-xs font-bold w-40"
                >
                  <FaCamera /> Change Photo
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  hidden
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file)
                      setProfile({
                        ...profile,
                        image: URL.createObjectURL(file),
                      });
                  }}
                />
              </div>

              <div className="w-full space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={profile.name}
                    onChange={(e) =>
                      setProfile({ ...profile, name: e.target.value })
                    }
                    className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-[#2ecc71] focus:outline-none bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">
                    Status
                  </label>
                  <textarea
                    rows="2"
                    value={profile.status}
                    onChange={(e) =>
                      setProfile({ ...profile, status: e.target.value })
                    }
                    className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-[#2ecc71] focus:outline-none bg-gray-50 resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t flex justify-end gap-3 bg-gray-50">
              <button
                onClick={() => setShowProfileModal(false)}
                className="px-6 py-2 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-200 transition-colors bg-white border"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowProfileModal(false)}
                className="px-6 py-2 rounded-lg text-sm font-bold text-white bg-[#2ecc71] hover:bg-[#27ae60] transition-shadow shadow-md"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- SIDEBAR --- */}
      <div
        className={`${selectedChat ? "hidden md:flex" : "flex"} w-full md:w-[350px] lg:w-[400px] flex-col border-r bg-white shrink-0`}
      >
        <div className="bg-[#2ecc71] p-4 flex justify-between items-center text-white shrink-0">
          <span className="font-bold text-lg">{profile.name}</span>
          <button
            onClick={() => setShowProfileModal(true)}
            className="hover:scale-110 transition-transform"
          >
            <FaUserCircle className="text-2xl" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b relative shrink-0">
          <button
            onClick={() => setActiveTab("chats")}
            className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 ${activeTab === "chats" ? "text-[#2ecc71]" : "text-gray-400"}`}
          >
            💬 Chats
            {activeTab === "chats" && (
              <div className="absolute bottom-0 h-1 w-1/2 left-0 bg-[#2ecc71]"></div>
            )}
          </button>
          <button
            onClick={() => setActiveTab("contacts")}
            className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 ${activeTab === "contacts" ? "text-[#2ecc71]" : "text-gray-400"}`}
          >
            👥 Contacts
            {activeTab === "contacts" && (
              <div className="absolute bottom-0 h-1 w-1/2 right-0 bg-[#2ecc71]"></div>
            )}
          </button>
        </div>

        {/* Search */}
        <div className="p-3 bg-white">
          <div className="relative flex items-center">
            <FaSearch className="absolute left-4 text-gray-400" />
            <input
              type="text"
              placeholder={`Search ${activeTab}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full border border-gray-100 rounded-full py-2.5 pl-12 pr-4 text-sm bg-gray-50 focus:outline-none focus:ring-1 focus:ring-[#2ecc71]"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filteredList.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelectedChat(item)}
              className={`flex items-center gap-4 p-4 cursor-pointer hover:bg-gray-50 border-b transition-colors ${selectedChat?.id === item.id ? "bg-[#eafaf1]" : ""}`}
            >
              <div className="relative shrink-0">
                <FaUserCircle className="text-5xl text-gray-200" />
                {item.online && (
                  <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-[#2ecc71] rounded-full border-2 border-white"></div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-0.5">
                  <h4 className="font-bold text-gray-800 text-sm truncate">
                    {item.name}
                  </h4>
                  {activeTab === "chats" && (
                    <span className="text-[10px] text-gray-400">
                      {item.time}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 truncate">
                  {activeTab === "chats" ? item.lastMsg : item.status}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* --- MAIN CHAT AREA --- */}
      <div
        className={`${!selectedChat ? "hidden md:flex" : "flex"} flex-1 flex-col bg-[#f0f2f5] relative overflow-hidden`}
      >
        {selectedChat ? (
          <>
            <div className="bg-white p-3 border-b flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSelectedChat(null)}
                  className="md:hidden text-[#2ecc71] p-2"
                >
                  <FaArrowLeft />
                </button>
                <FaUserCircle className="text-4xl text-gray-200" />
                <div>
                  <h2 className="text-gray-800 font-bold text-sm">
                    {selectedChat.name}
                  </h2>
                  <p className="text-[10px] text-[#2ecc71] font-bold">
                    {selectedChat.online ? "Online" : "Offline"}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
              <div className="self-start bg-white p-3 rounded-xl rounded-tl-none shadow-sm max-w-[70%] text-sm">
                {activeTab === "chats"
                  ? selectedChat.lastMsg
                  : "Hello! Let's chat."}
                <span className="text-[10px] text-gray-400 block mt-1">
                  {selectedChat.time || "10:00 AM"}
                </span>
              </div>

              {selectedChat.messages?.map((msg) => (
                <div
                  key={msg.id}
                  className="self-end bg-[#2ecc71] text-white p-3 rounded-xl rounded-tr-none shadow-md max-w-[70%] text-sm animate-in slide-in-from-right-2"
                >
                  {msg.text}
                  <span className="text-[9px] text-green-100 block mt-1 text-right">
                    {msg.time}
                  </span>
                </div>
              ))}
            </div>

            {/* Attachments Menu */}
            {showAttachments && (
              <div
                ref={attachmentRef}
                className="absolute bottom-20 right-6 bg-white shadow-2xl rounded-2xl p-2 border w-48 z-50 animate-in slide-in-from-bottom-4"
              >
                <div className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer rounded-xl group transition-colors">
                  <FaImage className="text-cyan-500 group-hover:scale-110 transition-transform" />{" "}
                  <span className="text-sm font-medium text-gray-700">
                    Photo
                  </span>
                </div>
                <div className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer rounded-xl group transition-colors">
                  <FaFileAlt className="text-red-400 group-hover:scale-110 transition-transform" />{" "}
                  <span className="text-sm font-medium text-gray-700">
                    Document
                  </span>
                </div>
                <div className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer rounded-xl group transition-colors">
                  <FaVideo className="text-blue-400 group-hover:scale-110 transition-transform" />{" "}
                  <span className="text-sm font-medium text-gray-700">
                    Video
                  </span>
                </div>
              </div>
            )}

            {/* Input Bar */}
            <div className="bg-white p-4 border-t flex items-center gap-3 shrink-0">
              <input
                type="text"
                value={inputMsg}
                onChange={(e) => setInputMsg(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSend()}
                placeholder="Type a message..."
                className="flex-1 border-none rounded-full py-3 px-6 text-sm bg-gray-100 focus:ring-2 focus:ring-[#2ecc71] focus:outline-none"
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAttachments(!showAttachments);
                }}
                className="text-gray-400 hover:text-[#2ecc71] transition-colors p-2"
              >
                <FaPaperclip size={22} />
              </button>
              <button
                onClick={handleSend}
                className="bg-[#2ecc71] text-white p-3.5 rounded-full hover:bg-[#27ae60] shadow-lg active:scale-90 transition-all"
              >
                <FaTelegramPlane size={20} />
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-300">
            <FaTelegramPlane size={80} className="mb-4 opacity-20" />
            <p className="text-gray-400 font-medium">
              Select a chat to start messaging
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Chat;
