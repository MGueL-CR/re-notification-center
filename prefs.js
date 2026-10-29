import Gio from "gi://Gio";
import GLib from "gi://GLib";
import GObject from "gi://GObject";
import Gtk from "gi://Gtk";
import Adw from "gi://Adw";
import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";
import { gettext as _ } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

let settings = null;

function reloadExtension() {
    settings.get_boolean("reload-signal")
        ? settings.set_boolean("reload-signal", false)
        : settings.set_boolean("reload-signal", true);
}

function reloadApplicationProfiles() {
    settings.get_boolean("reload-profiles-signal")
        ? settings.set_boolean("reload-profiles-signal", false)
        : settings.set_boolean("reload-profiles-signal", true);
}

const ApplicationItem = GObject.registerClass(
    {
        GTypeName: "ReNotificationCenterApplicationItem",
        Properties: {
            "app-info": GObject.ParamSpec.object(
                "app-info",
                "app-info",
                "Application information",
                GObject.ParamFlags.READWRITE,
                Gio.AppInfo,
            ),
            name: GObject.ParamSpec.string(
                "name",
                "name",
                "Application name",
                GObject.ParamFlags.READWRITE,
                "",
            ),
            icon: GObject.ParamSpec.object(
                "icon",
                "icon",
                "Application icon",
                GObject.ParamFlags.READWRITE,
                Gio.Icon,
            ),
        },
    },
    class ApplicationItem extends GObject.Object {
        _init(appInfo, name, icon) {
            super._init({
                "app-info": appInfo,
                name: name,
                icon: icon,
            });
        }
    },
);

const PrefsWindow = GObject.registerClass(
    class PrefsWindow extends Gtk.Grid {
        _init() {
            super._init({
                column_spacing: 80,
                halign: Gtk.Align.CENTER,
                margin_top: 20,
                margin_end: 20,
                margin_bottom: 20,
                margin_start: 20,
                row_spacing: 20,
            });
        }

        attachLabel(KEY, pos) {
            let prefLabel = new Gtk.Label({
                xalign: 1,
                label: _(settings.settings_schema.get_key(KEY).get_summary()),
                halign: Gtk.Align.START,
            });
            this.attach(prefLabel, 0, pos, 1, 1);
        }

        prefCombo(KEY, pos, options, items) {
            let SettingCombo = new Gtk.ComboBoxText();
            for (let i = 0; i < options.length; i++) {
                SettingCombo.append(options[i], items[i]);
            }
            SettingCombo.set_active(options.indexOf(settings.get_string(KEY)));
            SettingCombo.connect("changed", (widget) => {
                settings.set_string(KEY, options[widget.get_active()]);
                reloadExtension();
            });
            this.attachLabel(KEY, pos);
            this.attach(SettingCombo, 1, pos, 1, 1);
        }

        prefStr(KEY, pos, options, items) {
            let SettingCombo = new Gtk.ComboBoxText();

            for (let i = 0; i < options.length; i++) {
                SettingCombo.append(options[i], items[i]);
            }

            let keyVal = settings.get_strv(KEY);
            let strSetting = new Gtk.Entry({
                text: keyVal[0].substring(1 + keyVal[0].indexOf(">")),
            });
            let box = new Gtk.Box({ halign: Gtk.Align.END });

            strSetting.set_width_chars(1);
            SettingCombo.set_active(
                options.indexOf(
                    keyVal[0].substring(0, 1 + keyVal[0].indexOf(">")),
                ),
            );
            SettingCombo.connect("changed", (widget) => {
                keyVal.pop();
                keyVal.push(options[widget.get_active()] + strSetting.text);
                settings.set_strv(KEY, keyVal);
            });

            strSetting.connect("changed", () => {
                keyVal.pop();
                keyVal.push(
                    options[SettingCombo.get_active()] + strSetting.text,
                );
                settings.set_strv(KEY, keyVal);
            });

            box.append(SettingCombo);
            box.append(new Gtk.Label({ label: "  +  " }));
            box.append(strSetting);

            this.attachLabel(KEY, pos);
            this.attach(box, 1, pos, 1, 1);
        }

        prefSwitch(KEY, pos) {
            let SettingSwitch = new Gtk.Switch({
                hexpand: false,
                active: settings.get_boolean(KEY),
                halign: Gtk.Align.END,
            });
            SettingSwitch.connect("notify::active", (button) => {
                settings.set_boolean(KEY, button.active);
                reloadExtension();
            });
            this.attachLabel(KEY, pos);
            this.attach(SettingSwitch, 1, pos, 1, 1);
        }

        prefTime(KEY, pos, mn, mx, st) {
            let timeSetting = Gtk.SpinButton.new_with_range(mn, mx, st);
            timeSetting.set_value(settings.get_int(KEY));
            timeSetting.connect("notify::value", (spin) => {
                settings.set_int(KEY, spin.get_value_as_int());
            });

            this.attachLabel(KEY, pos);
            this.attach(timeSetting, 1, pos, 1, 1);
        }
    },
);

const PrefsForAppList = GObject.registerClass(
    class PrefsForAppList extends Gtk.Grid {
        appViewChange() {
            let applicationList = settings.get_strv("application-list");
            let nameList = settings.get_strv("name-list");

            const selectedItem = this._selection.get_selected_item();

            this.selectedIndex = selectedItem
                ? applicationList.indexOf(selectedItem.app_info.get_id())
                : -1;

            if (this.selectedIndex >= 0) {
                let scriptList = settings.get_strv("script-list");

                this.scriptLocation.text = scriptList[this.selectedIndex];
                this.scriptLocation.sensitive = true;
                this.browseButton.sensitive = true;

                this.AppLabel.label =
                    _("Custom script location for") +
                    " " +
                    nameList[this.selectedIndex];

                this.AppIcon.gicon = selectedItem.icon;
            } else {
                this.scriptLocation.text = "";
                this.scriptLocation.sensitive = false;
                this.browseButton.sensitive = false;
                this.AppIcon.gicon = null;
            }

            this.setButton.sensitive = false;
        }

        attachLabel(KEY, pos, box) {
            let prefLabel = new Gtk.Label({
                xalign: 1,
                label: _(settings.settings_schema.get_key(KEY).get_summary()),
                halign: Gtk.Align.START,
            });
            box.attach(prefLabel, 0, pos, 1, 1);
        }

        addApp() {
            let dialog = new Gtk.Dialog({
                title: _("Choose an application"),
                transient_for: this.get_native(),
                use_header_bar: true,
                modal: true,
            });
            dialog._appChooser = new Gtk.AppChooserWidget({
                content_type: "text/plain",
                show_all: true,
                margin_top: 5,
                margin_end: 5,
                margin_bottom: 5,
                margin_start: 5,
                vexpand: true,
            });
            dialog.set_default_response(Gtk.ResponseType.OK);
            dialog.add_button("Cancel", Gtk.ResponseType.CANCEL);
            let addButton = dialog.add_button(_("Add"), Gtk.ResponseType.OK);
            let hbox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                hexpand: true,
                vexpand: true,
            });
            hbox.append(dialog._appChooser);
            dialog.get_content_area().append(hbox);
            dialog.connect("response", (dialog, id) => {
                if (id != Gtk.ResponseType.OK) {
                    dialog.close();
                    return;
                }

                let appInfo = dialog._appChooser.get_app_info();
                if (!appInfo) {
                    return;
                }

                let applicationList = settings.get_strv("application-list");
                let nameList = settings.get_strv("name-list");
                let scriptList = settings.get_strv("script-list");
                if (applicationList.indexOf(appInfo.get_id()) >= 0) {
                    dialog.close();
                    return;
                }
                applicationList.push(appInfo.get_id());
                nameList.push(appInfo.get_name());
                scriptList.push("");
                settings.set_strv("application-list", applicationList);
                settings.set_strv("name-list", nameList);
                settings.set_strv("script-list", scriptList);
                const item = new ApplicationItem(
                    appInfo,
                    appInfo.get_name(),
                    appInfo.get_icon(),
                );

                this._store.append(item);
                reloadApplicationProfiles();
                dialog.close();
            });

            dialog.present();
        }

        displayPrefs() {
            this.makeList();
            this.showPrefs();
            this.refreshList();
        }

        makeList() {
            this._store = Gio.ListStore.new(ApplicationItem);

            this._selection = new Gtk.SingleSelection({
                model: this._store,
            });

            const factory = new Gtk.SignalListItemFactory();

            factory.connect("setup", (factory, listItem) => {
                const row = new Gtk.Box({
                    orientation: Gtk.Orientation.HORIZONTAL,
                    spacing: 12,
                    margin_top: 6,
                    margin_bottom: 6,
                    margin_start: 6,
                    margin_end: 6,
                });

                const icon = new Gtk.Image({
                    pixel_size: 32,
                });

                const name = new Gtk.Label({
                    xalign: 0,
                    hexpand: true,
                });

                row.append(icon);
                row.append(name);

                listItem.set_child(row);
            });

            factory.connect("bind", (factory, listItem) => {
                const item = listItem.get_item();
                const row = listItem.get_child();
                const icon = row.get_first_child();
                const name = icon.get_next_sibling();

                icon.set_from_gicon(item.icon);
                name.set_text(item.name);
            });

            this.listView = new Gtk.ListView({
                model: this._selection,
                factory: factory,
                hexpand: true,
                vexpand: true,
                halign: Gtk.Align.FILL,
            });

            const listBox = new Gtk.ScrolledWindow({
                hexpand: true,
                vexpand: true,
                child: this.listView,
            });

            this.attach(listBox, 0, 0, 1, 1);
        }

        prefCombo(KEY, pos, options, items, box) {
            let SettingCombo = new Gtk.ComboBoxText();
            for (let i = 0; i < options.length; i++) {
                SettingCombo.append(options[i], items[i]);
            }
            SettingCombo.set_active(options.indexOf(settings.get_string(KEY)));
            SettingCombo.connect("changed", (widget) => {
                settings.set_string(KEY, options[widget.get_active()]);
                settings.get_strv("application-list").forEach(function (
                    application,
                ) {
                    this.setNotificationBannerPolicy(
                        "/org/gnome/desktop/notifications/application/" +
                            application
                                .toLowerCase()
                                .replace(/[^a-z0-9-]/g, "-")
                                .replace(/--+/g, "-")
                                .substring(0, application.length - 8) +
                            "/",
                        widget.get_active(),
                    );
                }, this);
                reloadApplicationProfiles();
            });

            this.attachLabel(KEY, pos, box);
            box.attach(SettingCombo, 1, pos, 1, 1);
        }

        prefSwitch(KEY, pos, box) {
            let SettingSwitch = new Gtk.Switch({
                hexpand: false,
                active: settings.get_boolean(KEY),
                halign: Gtk.Align.END,
            });
            SettingSwitch.connect("notify::active", (button) => {
                settings.set_boolean(KEY, button.active);
                reloadExtension();
            });
            this.attachLabel(KEY, pos, box);
            box.attach(SettingSwitch, 1, pos, 1, 1);
        }

        refreshList() {
            this._store.remove_all();

            let applicationList = settings.get_strv("application-list");
            let nameList = settings.get_strv("name-list");
            let scriptList = settings.get_strv("script-list");

            for (let i = 0; i < applicationList.length; i++) {
                const appInfo = Gio.DesktopAppInfo.new(applicationList[i]);

                if (appInfo === null) {
                    applicationList.splice(i, 1);
                    nameList.splice(i, 1);
                    scriptList.splice(i, 1);
                    i--;
                } else {
                    const item = new ApplicationItem(
                        appInfo,
                        nameList[i],
                        appInfo.get_icon(),
                    );

                    this._store.append(item);
                }
            }

            settings.set_strv("application-list", applicationList);
            settings.set_strv("name-list", nameList);
            settings.set_strv("script-list", scriptList);
        }

        removeApp() {
            const selectedItem = this._selection.get_selected_item();

            if (selectedItem !== null) {
                const applicationList = settings.get_strv("application-list");
                const nameList = settings.get_strv("name-list");
                const scriptList = settings.get_strv("script-list");

                const appInfo = selectedItem.app_info;
                const index = applicationList.indexOf(appInfo.get_id());

                if (index >= 0) {
                    applicationList.splice(index, 1);
                    nameList.splice(index, 1);
                    scriptList.splice(index, 1);

                    settings.set_strv("application-list", applicationList);
                    settings.set_strv("name-list", nameList);
                    settings.set_strv("script-list", scriptList);

                    this.selectedIndex = -1;

                    const position = this._selection.get_selected();
                    this._store.remove(position);
                }
            }

            this.appViewChange();
            reloadApplicationProfiles();
        }

        fileManagementDialogWindow(action) {
            let fileFormats = new Gtk.FileFilter();
            let dialog = new Gtk.FileChooserDialog({
                title: _("Choose a Script file") + " ",
                action: action,
                filter: fileFormats,
                transient_for: this.get_native(),
                use_header_bar: true,
                modal: true,
            });
            let exportButton = dialog.add_button(_("Set"), Gtk.ResponseType.OK);

            fileFormats.add_pattern("*.sh");
            dialog.add_button(_("Cancel"), Gtk.ResponseType.CANCEL);
            dialog.present();

            dialog.connect("response", (dialog, id) => {
                if (id === Gtk.ResponseType.OK) {
                    const file = dialog.get_file();

                    if (file !== null) {
                        this.scriptLocation.text = file.get_path();
                    }
                }
                dialog.close();
                return;
            });
        }

        showPrefs() {
            let box = new Gtk.Grid({
                column_spacing: 20,
                halign: Gtk.Align.CENTER,
                margin_top: 20,
                margin_end: 20,
                margin_bottom: 20,
                margin_start: 20,
                row_spacing: 20,
            });
            let addButton = new Gtk.Button({
                label: _("     Add    "),
                halign: Gtk.Align.START,
            });
            let delButton = new Gtk.Button({
                label: _(" Remove "),
                halign: Gtk.Align.END,
            });
            this.scriptLocation = new Gtk.Entry({ text: "", sensitive: false });
            this.setButton = new Gtk.Button({
                label: _("Set"),
                halign: Gtk.Align.END,
                sensitive: false,
            });
            this.clearButton = new Gtk.Button({
                label: _("Clear"),
                halign: Gtk.Align.START,
                sensitive: false,
            });
            this.browseButton = new Gtk.Button({
                label: _("Browse"),
                halign: Gtk.Align.START,
                sensitive: false,
            });

            this.AppLabel = new Gtk.Label({
                xalign: 1,
                use_markup: true,
                halign: Gtk.Align.CENTER,
            });
            this.AppIcon = new Gtk.Image({ gicon: null, pixel_size: 96 });
            this.iconImageBox = new Gtk.Box({ halign: Gtk.Align.CENTER });
            this.iconImageBox.append(this.AppIcon);

            this.AppLabel.label = _("No application selected");

            this.selectedIndex = -1;
            addButton.connect("clicked", () => this.addApp());
            delButton.connect("clicked", () => this.removeApp());
            this.browseButton.connect("clicked", () =>
                this.fileManagementDialogWindow(0),
            );
            this.scriptLocation.connect("changed", () => {
                if (this.scriptLocation.text != "") {
                    this.setButton.sensitive = true;
                    this.clearButton.sensitive = true;
                } else {
                    this.setButton.sensitive = false;
                    this.clearButton.sensitive = false;
                }
            });
            this.setButton.connect("clicked", () => {
                if (this.selectedIndex > -1) {
                    let scriptList = settings.get_strv("script-list");
                    scriptList[this.selectedIndex] = this.scriptLocation.text;
                    settings.set_strv("script-list", scriptList);
                }
            });
            this.clearButton.connect("clicked", () => {
                if (this.selectedIndex > -1) {
                    let scriptList = settings.get_strv("script-list");
                    this.scriptLocation.text = "";
                    scriptList[this.selectedIndex] = "";
                    settings.set_strv("script-list", scriptList);
                }
            });

            box.attach(addButton, 0, 0, 1, 1);
            box.attach(delButton, 1, 0, 1, 1);
            box.attach(new Gtk.Label({ label: "" }), 0, 1, 2, 1);
            box.attach(
                new Gtk.Label({
                    use_markup: true,
                    label:
                        "<big><b>" +
                        _("For All Applications on the List") +
                        "</b></big>",
                    halign: Gtk.Align.CENTER,
                }),
                0,
                2,
                2,
                1,
            );
            box.attach(new Gtk.Label({ label: "" }), 0, 3, 2, 1);
            this.prefCombo(
                "for-list",
                4,
                ["none", "count", "banner", "both"],
                [
                    _("Show them"),
                    _("Show counts only"),
                    _("Show banner only"),
                    _("Ignore them"),
                ],
                box,
            );
            this.prefSwitch("run-script", 5, box);
            box.attach(new Gtk.Label({ label: "" }), 0, 6, 2, 1);
            box.attach(
                new Gtk.Label({
                    use_markup: true,
                    label:
                        "<big><b>" +
                        _("For Selected Application") +
                        "</b></big>",
                    halign: Gtk.Align.CENTER,
                }),
                0,
                7,
                2,
                1,
            );
            box.attach(this.iconImageBox, 0, 9, 2, 1);
            box.attach(this.AppLabel, 0, 10, 2, 1);
            box.attach(this.scriptLocation, 0, 11, 2, 1);
            box.attach(this.setButton, 1, 12, 1, 1);
            box.attach(this.browseButton, 0, 12, 1, 1);
            box.attach(this.clearButton, 1, 12, 1, 1);
            this.attach(box, 1, 0, 1, 1);
            //this.treeView.connect("cursor-changed", () => this.appViewChange());
            this._selection.connect("notify::selected-item", () => {
                this.appViewChange();
            });
        }

        setNotificationBannerPolicy(caninicalizedNameWithPath, value) {
            switch (value) {
                case 0:
                case 2:
                    new Gio.Settings({
                        schema_id:
                            "org.gnome.desktop.notifications.application",
                        path: caninicalizedNameWithPath,
                    }).set_boolean("show-banners", true);
                    break;
                default:
                    new Gio.Settings({
                        schema_id:
                            "org.gnome.desktop.notifications.application",
                        path: caninicalizedNameWithPath,
                    }).set_boolean("show-banners", false);
            }
        }
    },
);

const PrefsForAbout = GObject.registerClass(
    class PrefsForAbout extends Gtk.Box {
        _init(extensionPath) {
            super._init({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 18,
                margin_top: 24,
                margin_bottom: 24,
                margin_start: 24,
                margin_end: 24,
            });

            this._extensionPath = extensionPath;
            this.set_halign(Gtk.Align.CENTER);
            this.set_valign(Gtk.Align.START);
            this.set_hexpand(true);
            this.set_vexpand(true);
        }

        displayPrefs() {
            const extensionIcon = new Gtk.Image({
                file: GLib.build_filenamev([this._extensionPath, "eicon.png"]),
                pixel_size: 96,
                margin_bottom: 6,
                halign: Gtk.Align.CENTER,
            });

            const extensionName = new Gtk.Label({
                label: "Re: Notification Center",
                halign: Gtk.Align.CENTER,
                css_classes: ["title-1"],
            });

            const description = new Gtk.Label({
                label: _(
                    "Move the notification center to the top panel with customizable appearance, behavior, and notification management.",
                ),
                halign: Gtk.Align.CENTER,
                justify: Gtk.Justification.CENTER,
                wrap: true,
                max_width_chars: 60,
                width_chars: 45,
            });

            const projectLink = new Gtk.LinkButton({
                label: _("GitHub Repository"),
                uri: "https://github.com/MGueL-CR/re-notification-center",
                halign: Gtk.Align.CENTER,
                margin_top: 6,
                css_classes: ["flat"],
            });

            const informationExpander = new Gtk.Expander({
                label: _("Information"),
                expanded: true,
            });

            const informationLabel = new Gtk.Label({
                label: _(
                    "Re: Notification Center is a fork of Notification Center by Selenium-H.",
                ),
                wrap: true,
                xalign: 0,
                //css_classes: ["dim-label"],
            });

            informationLabel.set_margin_top(8);
            informationLabel.set_margin_start(16);
            informationLabel.set_margin_end(16);
            informationLabel.set_margin_bottom(8);
            informationExpander.set_child(informationLabel);

            const helpExpander = new Gtk.Expander({
                label: _("Help"),
            });

            const issuesLink = new Gtk.LinkButton({
                label: _("Report a problem or request help"),
                uri: "https://github.com/MGueL-CR/re-notification-center/issues",
                halign: Gtk.Align.START,
                css_classes: ["flat"],
            });
            issuesLink.set_margin_top(8);
            issuesLink.set_margin_start(16);
            issuesLink.set_margin_end(16);
            issuesLink.set_margin_bottom(8);
            helpExpander.set_child(issuesLink);

            const resetExpander = new Gtk.Expander({
                label: _("Reset preferences"),
            });

            const resetBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 8,
            });

            const resetLabel = new Gtk.Label({
                label: _(
                    "Restore the extension's settings to their default values.",
                ),
                wrap: true,
                xalign: 0,
            });

            resetLabel.set_margin_top(8);
            resetLabel.set_margin_start(16);
            resetLabel.set_margin_end(16);
            resetLabel.set_margin_bottom(8);

            const resetButton = new Gtk.Button({
                label: _("Reset preferences"),
                halign: Gtk.Align.START,
            });

            resetButton.connect("clicked", () => {
                const parent = resetButton.get_root();

                const dialog = new Adw.MessageDialog({
                    heading: _("Reset preferences?"),
                    body: _(
                        "This will discard your current configuration and restore the default preferences.",
                    ),
                    transient_for: parent,
                    modal: true,
                });

                dialog.add_response("cancel", _("Cancel"));
                dialog.add_response("reset", _("Reset"));
                dialog.set_response_appearance(
                    "reset",
                    Adw.ResponseAppearance.DESTRUCTIVE,
                );
                dialog.set_default_response("cancel");
                dialog.set_close_response("cancel");

                dialog.connect("response", (dialog, response) => {
                    if (response !== "reset") return;

                    if (response !== "reset") return;

                    const listKeys = settings.list_keys();
                    const keysToReset = listKeys.filter(
                        (key) =>
                            ![
                                "current-version",
                                "reload-signal",
                                "reload-profiles-signal",
                            ].includes(key),
                    );

                    for (const key of keysToReset) {
                        settings.reset(key);
                    }

                    reloadExtension();

                    const confirmationDialog = new Adw.MessageDialog({
                        heading: _("Preferences reset"),
                        body: _(
                            "All preferences have been restored to their default values.",
                        ),
                        transient_for: parent,
                        modal: true,
                    });

                    confirmationDialog.connect("response", () => {
                        parent.close();
                    });

                    confirmationDialog.add_response("ok", _("OK"));
                    confirmationDialog.set_default_response("ok");
                    confirmationDialog.set_close_response("ok");
                    confirmationDialog.present();
                });

                dialog.present();
            });

            resetBox.append(resetLabel);
            resetBox.append(resetButton);
            resetExpander.set_child(resetBox);

            this.append(extensionIcon);
            this.append(extensionName);
            this.append(description);
            this.append(projectLink);
            this.append(informationExpander);
            this.append(helpExpander);
            this.append(resetExpander);
        }
    },
);

const PrefsForCalendar = GObject.registerClass(
    class PrefsForCalendar extends PrefsWindow {
        displayPrefs() {
            let pos = 0;
            this.prefCombo(
                "events-position",
                pos++,
                ["dontshow", "below", "beside"],
                [
                    _("Only In Notification Center") + "  ",
                    _("Below Calendar"),
                    _("Beside Calendar"),
                ],
            );
            this.prefSwitch("autohide-space-beside-calendar", pos++);
            this.prefSwitch("calendar-on-left", pos++);
            this.prefSwitchInverted("show-events-section-if-empty", pos++);
            this.prefSwitch("hide-clock-section", pos++);
            this.prefSwitch("hide-weather-section", pos++);
            this.prefSwitch("hide-date-section", pos++);
        }

        prefSwitchInverted(KEY, pos) {
            let SettingSwitch = new Gtk.Switch({
                hexpand: false,
                active: !settings.get_boolean(KEY),
                halign: Gtk.Align.END,
            });
            SettingSwitch.connect("notify::active", (button) => {
                settings.set_boolean(KEY, !button.active);
                reloadExtension();
            });
            this.attachLabel(KEY, pos);
            this.attach(SettingSwitch, 1, pos, 1, 1);
        }
    },
);

const PrefsForIndicator = GObject.registerClass(
    class PrefsForIndicator extends PrefsWindow {
        displayPrefs() {
            let pos = 0;

            this.prefCombo(
                "indicator-pos",
                pos++,
                ["left", "center", "right"],
                [_("Left"), _("Center"), _("Right")],
            );
            this.prefInt("indicator-index", pos++, 0, 20, 1);
            this.prefSwitch("individual-icons", pos++);
            this.prefSwitch("change-icons", pos++);
            this.prefComboInt(
                "autohide",
                pos++,
                ["0", "1", "2"],
                [_("No"), _("Yes"), _("If Do Not Disturb is Off")],
            );
            this.prefCombo(
                "new-notification",
                pos++,
                ["none", "dot", "count"],
                [_("Show Nothing"), _("Show Dot"), _("Show Count")],
            );
            this.prefSwitch("include-events-count", pos++);
            this.prefTime("blink-icon", pos++, 0, 10000, 1);
            this.prefTime("blink-time", pos++, 100, 10000, 10);
            this.prefSwitch("animate-icon", pos++);
            this.prefSwitch("show-label", pos++);
            this.prefSwitch("middle-click-dnd", pos++);
        }

        prefComboInt(KEY, pos, options, items) {
            let SettingCombo = new Gtk.ComboBoxText();
            for (let i = 0; i < options.length; i++) {
                SettingCombo.append(options[i], items[i]);
            }
            SettingCombo.set_active(settings.get_int(KEY));
            SettingCombo.connect("changed", (widget) => {
                settings.set_int(KEY, widget.get_active());
                reloadExtension();
            });

            this.attachLabel(KEY, pos);
            this.attach(SettingCombo, 1, pos, 1, 1);
        }

        prefInt(KEY, pos) {
            let timeSetting = Gtk.SpinButton.new_with_range(0, 20, 1);
            timeSetting.set_value(settings.get_int(KEY));
            timeSetting.connect("notify::value", (spin) => {
                settings.set_int(KEY, spin.get_value_as_int());
                reloadExtension();
            });

            this.attachLabel(KEY, pos);
            this.attach(timeSetting, 1, pos, 1, 1);
        }
    },
);

const PrefsForNotifications = GObject.registerClass(
    class PrefsForNotifications extends PrefsWindow {
        adjustOtherSectionsKeepingThisKeyValueSame(KEY) {
            let currentKeyValue = settings.get_int(KEY);
            let currentSection = KEY.substring(5, KEY.length);

            if (currentKeyValue == 0) {
                return;
            }

            let mediaNotificationEventsSectionOrder = [
                settings.get_int("show-media"),
                settings.get_int("show-notification"),
                settings.get_int("show-events"),
            ];

            let missingValue = 1;

            for (missingValue = 1; missingValue <= 3; missingValue++) {
                if (
                    mediaNotificationEventsSectionOrder.indexOf(missingValue) ==
                    -1
                ) {
                    break;
                }
            }

            if (
                currentKeyValue == mediaNotificationEventsSectionOrder[0] &&
                currentSection != "media"
            ) {
                settings.set_int("show-media", missingValue);
            }

            if (
                currentKeyValue == mediaNotificationEventsSectionOrder[1] &&
                currentSection != "notification"
            ) {
                settings.set_int("show-notification", missingValue);
            }

            if (
                currentKeyValue == mediaNotificationEventsSectionOrder[2] &&
                currentSection != "events"
            ) {
                settings.set_int("show-events", missingValue);
            }
        }

        displayPrefs() {
            let pos = 0;
            this.prefSectionPosition(
                "show-media",
                pos++,
                ["none", "top", "middle", "bottom"],
                [
                    _("Don't Show"),
                    _("At The Top"),
                    _("In The Middle"),
                    _("At The Bottom"),
                ],
            );
            this.prefSectionPosition(
                "show-notification",
                pos++,
                ["none", "top", "middle", "bottom"],
                [
                    _("Don't Show"),
                    _("At The Top"),
                    _("In The Middle"),
                    _("At The Bottom"),
                ],
            );
            this.prefSectionPosition(
                "show-events",
                pos++,
                ["none", "top", "middle", "bottom"],
                [
                    _("Don't Show"),
                    _("At The Top"),
                    _("In The Middle"),
                    _("At The Bottom"),
                ],
            );
            this.prefCombo(
                "dnd-position",
                pos++,
                ["none", "top", "bottom"],
                [_("Don't Show"), _("On Top"), _("At Bottom")],
            );
            this.prefCombo(
                "clear-button-alignment",
                pos++,
                ["left", "center", "right", "hide"],
                [_("Left"), _("Center"), _("Right"), _("Don't Show")],
            );
            this.prefSwitch("autoclose-menu", pos++);
            this.prefStr(
                "indicator-shortcut",
                pos++,
                ["<Alt>", "<Ctrl>", "<Shift>", "<Super>"],
                [_("Alt Key"), _("Ctrl Key"), _("Shift Key"), _("Super Key")],
            );
            this.prefTime("max-height", pos++, 20, 100, 1);
            this.prefCombo(
                "banner-pos",
                pos++,
                ["11", "12", "13", "21", "22", "23", "31", "32", "33"],
                [
                    _("Top Left"),
                    _("Top Center"),
                    _("Top Right"),
                    _("Middle Left"),
                    _("Middle Center"),
                    _("Middle Right"),
                    _("Bottom Left"),
                    _("Bottom Center"),
                    _("Bottom Right"),
                ],
            );
        }

        prefSectionPosition(KEY, pos, options, items) {
            let SettingCombo = new Gtk.ComboBoxText();
            for (let i = 0; i < options.length; i++) {
                SettingCombo.append(options[i], items[i]);
            }
            SettingCombo.set_active(settings.get_int(KEY));
            SettingCombo.connect("changed", (widget) => {
                settings.set_int(KEY, widget.get_active());
                this.adjustOtherSectionsKeepingThisKeyValueSame(KEY);
                this.reorderOrderOfSections();
                reloadExtension();
            });

            settings.connect(`changed::${KEY}`, () => {
                SettingCombo.set_active(settings.get_int(KEY));
            });

            this.attachLabel(KEY, pos);
            this.attach(SettingCombo, 1, pos, 1, 1);
        }

        reorderOrderOfSections() {
            let orderStr = ["noValue", "noValue", "noValue"];

            let mediaNotificationEventsSectionOrder = [
                settings.get_int("show-media"),
                settings.get_int("show-notification"),
                settings.get_int("show-events"),
            ];

            if (mediaNotificationEventsSectionOrder[0] != 0) {
                orderStr[mediaNotificationEventsSectionOrder[0] - 1] = "media";
            }

            if (mediaNotificationEventsSectionOrder[1] != 0) {
                orderStr[mediaNotificationEventsSectionOrder[1] - 1] =
                    "notification";
            }

            if (mediaNotificationEventsSectionOrder[2] != 0) {
                orderStr[mediaNotificationEventsSectionOrder[2] - 1] = "events";
            }

            let tempOrderStr = [];

            for (let i = 0; i < 3; i++) {
                if (orderStr[i] != "noValue") {
                    tempOrderStr.push(orderStr[i]);
                }
            }

            settings.set_strv("sections-order", tempOrderStr);
        }
    },
);
export default class Prefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        this.initTranslations();
        this._extensionPath = this.path;

        settings = this.getSettings(
            "org.gnome.shell.extensions.re-notification-center",
        );

        const toolbarView = this._createToolbarView();

        window.set_default_size(900, -1);
        window.set_content(toolbarView);
    }

    _createToolbarView() {
        const viewStack = this._createViewStack();

        const viewSwitcher = new Adw.ViewSwitcher({
            stack: viewStack,
            policy: Adw.ViewSwitcherPolicy.WIDE,
        });

        const headerBar = new Adw.HeaderBar({
            titleWidget: viewSwitcher,
        });

        const toolbarView = new Adw.ToolbarView();
        toolbarView.add_top_bar(headerBar);
        toolbarView.set_content(viewStack);

        return toolbarView;
    }

    _createViewStack() {
        const viewStack = new Adw.ViewStack();
        const listChilds = [
            {
                child: new PrefsForNotifications(),
                name: "notifications",
                title: _("Notifications"),
                icon: "preferences-system-notifications-symbolic",
            },
            {
                child: new PrefsForCalendar(),
                name: "calendar",
                title: _("Calendar"),
                icon: "x-office-calendar-symbolic",
            },
            {
                child: new PrefsForIndicator(),
                name: "indicator",
                title: _("Indicator"),
                icon: "view-list-symbolic",
            },
            {
                child: new PrefsForAppList(),
                name: "profiles",
                title: _("Profiles"),
                icon: "system-users-symbolic",
            },
            {
                child: new PrefsForAbout(this.path),
                name: "about",
                title: _("About"),
                icon: "help-about-symbolic",
            },
        ];

        for (const item of listChilds) {
            viewStack.add_titled(item.child, item.name, item.title);
            viewStack.get_page(item.child).set_icon_name(item.icon);
            item.child.displayPrefs();
        }
        return viewStack;
    }
}
